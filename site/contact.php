<?php
/* Formularul „Ai găsit o greșeală? Scrie-ne” de pe pagina Despre (Monitor local, zona publică).
   Mesajele se scriu în intern/date/mesaje.json, în folderul protejat cu parolă: le vede doar echipa, în panoul intern.
   Nu trimite e-mailuri și nu publică nimic. Protecții: doar de pe pagina monitorului, câmp-capcană pentru roboți,
   cel mult 5 mesaje pe oră de la aceeași adresă (păstrăm doar o amprentă a adresei IP, nu adresa). */

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

function iesire($cod, $d) { http_response_code($cod); echo json_encode($d, JSON_UNESCAPED_UNICODE); exit; }
function citeste($f) { if (!is_file($f)) return []; $d = json_decode(file_get_contents($f), true); return is_array($d) ? $d : []; }
function scrie($f, $d) {
  if (!is_dir(dirname($f))) mkdir(dirname($f), 0755, true);
  $tmp = $f . '.' . getmypid() . '.tmp';
  if (file_put_contents($tmp, json_encode($d, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), LOCK_EX) === false) iesire(500, ['eroare' => 'mesajul nu a putut fi salvat']);
  rename($tmp, $f);
}
function curat($s, $max) { $s = trim(preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/u', '', strval($s ?? ''))); return mb_substr($s, 0, $max); }

if ($_SERVER['REQUEST_METHOD'] !== 'POST') iesire(405, ['eroare' => 'metodă nepermisă']);
$orig = $_SERVER['HTTP_ORIGIN'] ?? ($_SERVER['HTTP_REFERER'] ?? '');
if (!preg_match('#^https://(www\.)?monitor\.radautiulcivic\.ro(/|$)#', $orig)) iesire(403, ['eroare' => 'cerere refuzată']);
$raw = file_get_contents('php://input');
if (strlen($raw) > 20000) iesire(413, ['eroare' => 'mesajul e prea lung']);
$in = json_decode($raw, true);
if (!is_array($in)) iesire(400, ['eroare' => 'date invalide']);
if (!empty($in['site'])) iesire(200, ['ok' => true]);   // câmpul-capcană: îl completează doar roboții

$mesaj = curat($in['mesaj'] ?? '', 4000);
if (mb_strlen($mesaj) < 5) iesire(400, ['eroare' => 'scrie mesajul (cel puțin câteva cuvinte)']);
$email = curat($in['email'] ?? '', 200);
if ($email !== '' && !filter_var($email, FILTER_VALIDATE_EMAIL)) iesire(400, ['eroare' => 'adresa de e-mail nu pare corectă']);

$DIR = __DIR__ . '/intern/date/';
$amp = hash('sha256', ($_SERVER['REMOTE_ADDR'] ?? '') . '|monitor-local');
$lim = citeste($DIR . 'mesaje-limite.json');
$acum = time();
$lim = array_filter($lim, function ($t) use ($acum) { return is_array($t) && count(array_filter($t, function ($x) use ($acum) { return $x > $acum - 3600; })); });
$ale = array_values(array_filter($lim[$amp] ?? [], function ($x) use ($acum) { return $x > $acum - 3600; }));
if (count($ale) >= 5) iesire(429, ['eroare' => 'ai trimis deja mai multe mesaje; încearcă din nou peste o oră']);
$ale[] = $acum; $lim[$amp] = $ale;
scrie($DIR . 'mesaje-limite.json', $lim);

$m = citeste($DIR . 'mesaje.json');
$m[] = ['la' => date('c'), 'mesaj' => $mesaj, 'nume' => curat($in['nume'] ?? '', 120), 'email' => $email,
        'pagina' => curat($in['pagina'] ?? '', 300), 'citit' => false];
if (count($m) > 3000) $m = array_slice($m, -3000);
scrie($DIR . 'mesaje.json', $m);
iesire(200, ['ok' => true]);
