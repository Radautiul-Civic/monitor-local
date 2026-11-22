<?php
/* Panoul de aprobare al rezumatelor (Monitor local, zona internă).
   Stă în folderul intern/, protejat cu parolă (cPanel Directory Privacy), deci doar echipa ajunge aici.
   Scrie doar trei fișiere:
     intern/date/video.json      înregistrările adăugate din panou (le transcrie fluxul GitHub „Transcriere ședințe”)
     intern/date/aprobari.json   deciziile: aprobat / respins / refă, cu textul aprobat (eventual corectat)
     date/rezumate.json          rezumatele aprobate, citite de pagina publică
   Fișierul e urcat de tools/publica.py la fiecare rulare; modificările se fac în repo (site_intern/api.php). */

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

function iesire($cod, $d) { http_response_code($cod); echo json_encode($d, JSON_UNESCAPED_UNICODE); exit; }
function citeste($f) { if (!is_file($f)) return []; $d = json_decode(file_get_contents($f), true); return is_array($d) ? $d : []; }
function scrie($f, $d) {
  if (!is_dir(dirname($f))) mkdir(dirname($f), 0755, true);
  $tmp = $f . '.' . getmypid() . '.tmp';
  if (file_put_contents($tmp, json_encode($d, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), LOCK_EX) === false) iesire(500, ['eroare' => 'nu pot scrie ' . basename($f)]);
  rename($tmp, $f);
}

$INTERN = __DIR__ . '/date/';
$PUBLIC = dirname(__DIR__) . '/date/';

if ($_SERVER['REQUEST_METHOD'] === 'GET') {   // starea, pentru panou
  iesire(200, ['video' => citeste($INTERN . 'video.json'), 'aprobari' => citeste($INTERN . 'aprobari.json'), 'ok' => true]);
}
if ($_SERVER['REQUEST_METHOD'] !== 'POST') iesire(405, ['eroare' => 'metodă nepermisă']);
// doar de pe pagina monitorului (o pagină străină nu poate trimite decizii în numele echipei)
$orig = $_SERVER['HTTP_ORIGIN'] ?? ($_SERVER['HTTP_REFERER'] ?? '');
if (!preg_match('#^https://(www\.)?monitor\.radautiulcivic\.ro(/|$)#', $orig)) iesire(403, ['eroare' => 'cerere refuzată']);
$raw = file_get_contents('php://input');
if (strlen($raw) > 400000) iesire(413, ['eroare' => 'prea mare']);
$in = json_decode($raw, true);
if (!is_array($in)) iesire(400, ['eroare' => 'date invalide']);
$cine = $_SERVER['REMOTE_USER'] ?? ($_SERVER['PHP_AUTH_USER'] ?? '');
$acum = date('c');

switch ($in['act'] ?? '') {
  case 'video':   // adaugă o înregistrare
    $data = $in['data'] ?? ''; $url = trim($in['url'] ?? '');
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $data)) iesire(400, ['eroare' => 'data trebuie să fie AAAA-LL-ZZ']);
    if (!preg_match('#^https://(www\.|m\.|web\.)?(facebook\.com|fb\.watch|youtube\.com|youtu\.be)/#', $url) || strlen($url) > 500) iesire(400, ['eroare' => 'linkul trebuie să fie de pe Facebook sau YouTube']);
    $v = citeste($INTERN . 'video.json');
    foreach ($v as $x) if (($x['url'] ?? '') === $url) iesire(200, ['ok' => true, 'nota' => 'era deja în listă']);
    $v[] = ['data' => $data, 'url' => $url, 'adaugat_la' => $acum, 'de' => $cine];
    scrie($INTERN . 'video.json', $v);
    iesire(200, ['ok' => true]);

  case 'decizie':   // aprobă / respinge / cere refacerea unui rezumat
    $id = $in['id'] ?? ''; $stare = $in['stare'] ?? '';
    if (!preg_match('/^\d{4}-\d{2}-\d{2}-[\w-]{1,40}$/', $id)) iesire(400, ['eroare' => 'id invalid']);
    if (!in_array($stare, ['aprobat', 'respins', 'refa', 'ciorna'], true)) iesire(400, ['eroare' => 'stare invalidă']);
    $a = citeste($INTERN . 'aprobari.json');
    $d = ['stare' => $stare, 'la' => $acum, 'de' => $cine];
    if ($stare === 'aprobat') {
      if (!is_array($in['rezumat'] ?? null)) iesire(400, ['eroare' => 'lipsește textul rezumatului']);
      $d['rezumat'] = $in['rezumat'];
      foreach (['data', 'url', 'titlu'] as $k) $d[$k] = substr(strval($in[$k] ?? ''), 0, 500);
    }
    $a[$id] = $d;
    scrie($INTERN . 'aprobari.json', $a);
    // fișierul public: doar rezumatele aprobate
    $pub = [];
    foreach ($a as $k => $x) if (($x['stare'] ?? '') === 'aprobat')
      $pub[] = ['id' => $k, 'data' => $x['data'] ?? substr($k, 0, 10), 'video' => $x['url'] ?? '', 'titlu_video' => $x['titlu'] ?? '', 'aprobat_la' => $x['la'], 'rezumat' => $x['rezumat']];
    usort($pub, function ($p, $q) { return strcmp($q['data'], $p['data']); });
    scrie($PUBLIC . 'rezumate.json', ['generat_la' => $acum, 'rezumate' => $pub]);
    iesire(200, ['ok' => true, 'publice' => count($pub)]);
}
iesire(400, ['eroare' => 'acțiune necunoscută']);
