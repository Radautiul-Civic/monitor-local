<?php
/* Alertele pe e-mail ale Monitorului local: noutățile despre o stradă sau un subiect (Asociația Rădăuțiul Civic).

   Abonarea are confirmare prin e-mail (dublă opțiune): până la click pe link, adresa nu primește nimic altceva.
   Păstrăm doar: adresa, străzile și subiectele alese, data abonării și a confirmării, ce i-am trimis deja (id-urile
   noutăților). Totul stă în intern/date/abonati.json, în folderul cu parolă. Dezabonarea șterge tot, imediat.

   Cum se folosește:
     POST {"act":"abonare","email":"...","strazi":["Putnei"],"subiecte":["taxe"],"acord":true}   (de pe pagina monitorului)
     GET  alerte.php?confirma=<cod>      confirmă abonarea
     GET  alerte.php?dezabonare=<cod>    șterge abonarea
     php alerte.php trimite             (din linia de comandă: cronul din cPanel, o dată pe zi) trimite noutățile noi
   E-mailurile pleacă prin funcția mail() a găzduirii; pentru alt furnizor (Brevo etc.) se schimbă doar trimite_mail(). */

const SITE = 'https://monitor.radautiulcivic.ro/';
const DE_LA = 'Monitor local <monitor@radautiulcivic.ro>';
const MAX_ABONATI = 5000;

$F = __DIR__ . '/intern/date/abonati.json';
$CLI = php_sapi_name() === 'cli';

function citeste($f) { if (!is_file($f)) return []; $d = json_decode(file_get_contents($f), true); return is_array($d) ? $d : []; }
function scrie($f, $d) {
  if (!is_dir(dirname($f))) mkdir(dirname($f), 0755, true);
  $tmp = $f . '.' . getmypid() . '.tmp';
  file_put_contents($tmp, json_encode($d, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), LOCK_EX);
  rename($tmp, $f);
}
function norm($s) {
  $s = mb_strtolower(strval($s), 'UTF-8');
  $s = strtr($s, ['ă' => 'a', 'â' => 'a', 'î' => 'i', 'ș' => 's', 'ş' => 's', 'ț' => 't', 'ţ' => 't']);
  return preg_replace('/\s+/', ' ', preg_replace('/[^a-z0-9 ]+/', ' ', $s));
}
// subiectele cu mai multe cuvinte-cheie (alegerea din formular -> începuturile de cuvânt căutate în noutăți)
const SUBIECTE = ['termic' => ['termic', 'termoficar', 'caldur'], 'salubr' => ['salubr', 'deseu', 'gunoi', 'insule ecologice'],
  'apa' => ['apa potabil', 'canalizar', 'acet', 'alimentare cu apa', 'apa si canal'], 'ilumin' => ['iluminat'],
  'dezapez' => ['dezapez', 'deszapez', 'salubrizare stradala', 'zapad'], 'servicii comunale' => ['servicii comunale']];
function chei_subiect($s) { $k = norm($s); return SUBIECTE[$k] ?? [$k]; }
function curat($s, $max) { return mb_substr(trim(preg_replace('/[\x00-\x1F\x7F<>]/u', '', strval($s ?? ''))), 0, $max); }
function trimite_mail($catre, $subiect, $text) {
  $h = "From: " . DE_LA . "\r\nReply-To: contact@radautiulcivic.ro\r\nMIME-Version: 1.0\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: 8bit";
  return mail($catre, '=?UTF-8?B?' . base64_encode($subiect) . '?=', $text, $h);
}
function pagina($titlu, $text) {
  header('Content-Type: text/html; charset=utf-8');
  echo '<!doctype html><html lang="ro"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' . htmlspecialchars($titlu) . ' - Monitor local</title>'
    . '<style>body{font-family:system-ui,sans-serif;max-width:560px;margin:60px auto;padding:0 16px;line-height:1.6;color:#1d2733;background:#f6f5f2}a{color:#1b5fae}</style></head><body>'
    . '<h1>' . htmlspecialchars($titlu) . '</h1><p>' . $text . '</p><p><a href="' . SITE . '">Înapoi la Monitor local</a></p></body></html>';
  exit;
}
function json_iesire($cod, $d) { http_response_code($cod); header('Content-Type: application/json; charset=utf-8'); header('Cache-Control: no-store'); echo json_encode($d, JSON_UNESCAPED_UNICODE); exit; }
function blocheaza($F) { if (!is_dir(dirname($F))) mkdir(dirname($F), 0755, true); $fp = fopen($F . '.lock', 'c'); if ($fp) flock($fp, LOCK_EX); return $fp; }

// ---------- trimiterea (cron, linia de comandă) ----------
if ($CLI) {
  if (($argv[1] ?? '') !== 'trimite') { fwrite(STDERR, "folosire: php alerte.php trimite\n"); exit(1); }
  $N = citeste(__DIR__ . '/date/noutati.json');
  $ev = $N['evenimente'] ?? [];
  $fp = blocheaza($F);
  $A = citeste($F); $trimise = 0;
  foreach ($A as $email => &$a) {
    if (empty($a['confirmat'])) {   // neconfirmat de peste 7 zile: se șterge
      if (($a['creat'] ?? 0) < time() - 7 * 86400) $a = null;
      continue;
    }
    $vazut = array_flip($a['trimis'] ?? []); $chei = array_map('norm', $a['strazi'] ?? []); foreach ($a['subiecte'] ?? [] as $sb) $chei = array_merge($chei, chei_subiect($sb));
    $gasite = [];
    foreach ($ev as $e) {
      $id = $e['id'] ?? md5(($e['tip'] ?? '') . ($e['titlu'] ?? '') . ($e['data'] ?? ''));
      if (isset($vazut[$id]) || ($e['data'] ?? '') < substr($a['confirmat_la'] ?? '', 0, 10)) continue;
      $t = ' ' . norm(($e['titlu'] ?? '') . ' ' . ($e['text'] ?? '')) . ' ';
      $dublu = md5(($e['data'] ?? '') . ($e['titlu'] ?? '') . ($e['text'] ?? ''));
      foreach ($gasite as $g) if ($g['_d'] === $dublu) continue 2;
      foreach ($chei as $k) if ($k !== '' && strpos($t, ' ' . $k) !== false) { $gasite[$id] = $e + ['_k' => $k, '_d' => $dublu]; break; }
    }
    if ($gasite) {
      $txt = "Bună ziua,\n\nPe Monitor local au apărut noutăți despre ce urmăriți (" . implode(', ', array_merge($a['strazi'] ?? [], $a['subiecte'] ?? [])) . "):\n\n";
      foreach (array_slice($gasite, 0, 30) as $e) {
        $link = (strpos($e['link'] ?? '', '#') === 0) ? SITE . $e['link'] : ($e['link'] ?? SITE);
        $txt .= "- " . ($e['data'] ?? '') . ": " . ($e['titlu'] ?? '') . (!empty($e['text']) ? "\n  " . mb_substr($e['text'], 0, 160) : '') . "\n  " . $link . "\n";
      }
      $txt .= "\nDatele vin din documentele publice ale Primăriei Rădăuți, citite automat; verificați în document.\n\n"
        . "Nu mai doriți aceste e-mailuri? Dezabonare, cu un click: " . SITE . "alerte.php?dezabonare=" . $a['cod'] . "\n\nMonitor local, un proiect al Asociației Rădăuțiul Civic\n";
      if (trimite_mail($email, 'Monitor local: ' . count($gasite) . (count($gasite) === 1 ? ' noutate' : ' noutăți') . ' despre ce urmăriți', $txt)) {
        $a['trimis'] = array_slice(array_merge($a['trimis'] ?? [], array_keys($gasite)), -500); $trimise++;
      }
    }
    // ce nu se potrivește nu mai trebuie verificat data viitoare
    foreach ($ev as $e) { $id = $e['id'] ?? md5(($e['tip'] ?? '') . ($e['titlu'] ?? '') . ($e['data'] ?? '')); if (!isset($gasite[$id]) && !isset($vazut[$id])) $a['trimis'][] = $id; }
    $a['trimis'] = array_slice(array_values(array_unique($a['trimis'] ?? [])), -1500);
  }
  unset($a);
  $A = array_filter($A);
  scrie($F, $A);
  if ($fp) flock($fp, LOCK_UN);
  echo "e-mailuri trimise: $trimise, abonați: " . count($A) . "\n";
  exit(0);
}

// ---------- confirmare și dezabonare (link din e-mail) ----------
if ($_SERVER['REQUEST_METHOD'] === 'GET') {
  foreach (['confirma', 'dezabonare'] as $act) {
    if (!isset($_GET[$act])) continue;
    $cod = strval($_GET[$act]);
    if (!preg_match('/^[a-f0-9]{32}$/', $cod)) pagina('Link greșit', 'Linkul nu e complet. Copiați-l întreg din e-mail.');
    $fp = blocheaza($F); $A = citeste($F); $gasit = null;
    foreach ($A as $em => $a) if (hash_equals($a['cod'] ?? '', $cod)) $gasit = $em;
    if ($gasit === null) { if ($fp) flock($fp, LOCK_UN); pagina($act === 'confirma' ? 'Link expirat' : 'Abonarea nu mai există', $act === 'confirma' ? 'Abonarea nu a fost găsită; poate a expirat (linkul e valabil 7 zile). Abonați-vă din nou de pe monitor.' : 'Adresa nu mai e în lista noastră; nu veți mai primi e-mailuri.'); }
    if ($act === 'confirma') { $A[$gasit]['confirmat'] = true; $A[$gasit]['confirmat_la'] = date('c'); }
    else unset($A[$gasit]);
    scrie($F, $A); if ($fp) flock($fp, LOCK_UN);
    if ($act === 'confirma') pagina('Abonare confirmată', 'Veți primi un e-mail când apar pe monitor noutăți despre: <b>' . htmlspecialchars(implode(', ', array_merge($A[$gasit]['strazi'] ?? [], $A[$gasit]['subiecte'] ?? []))) . '</b>. Fiecare e-mail are un link de dezabonare.');
    pagina('V-ați dezabonat', 'Adresa și alegerile dumneavoastră au fost șterse. Nu veți mai primi e-mailuri de la Monitor local.');
  }
  json_iesire(200, ['ok' => true]);
}

// ---------- abonare (formularul de pe monitor) ----------
if ($_SERVER['REQUEST_METHOD'] !== 'POST') json_iesire(405, ['eroare' => 'metodă nepermisă']);
$orig = $_SERVER['HTTP_ORIGIN'] ?? ($_SERVER['HTTP_REFERER'] ?? '');
if (!preg_match('#^https://(www\.)?monitor\.radautiulcivic\.ro(/|$)#', $orig)) json_iesire(403, ['eroare' => 'cerere refuzată']);
$in = json_decode(file_get_contents('php://input', false, null, 0, 5000), true);
if (!is_array($in) || ($in['act'] ?? '') !== 'abonare') json_iesire(400, ['eroare' => 'date invalide']);
if (!empty($in['site'])) json_iesire(200, ['ok' => true]);   // câmpul-capcană
$email = mb_strtolower(curat($in['email'] ?? '', 200));
if (!filter_var($email, FILTER_VALIDATE_EMAIL)) json_iesire(400, ['eroare' => 'adresa de e-mail nu pare corectă']);
if (empty($in['acord'])) json_iesire(400, ['eroare' => 'bifați acordul pentru prelucrarea adresei']);
$lista = function ($x) { $o = []; foreach ((is_array($x) ? $x : []) as $s) { $s = curat($s, 60); if (mb_strlen($s) >= 3 && !in_array($s, $o, true)) $o[] = $s; } return array_slice($o, 0, 5); };
$strazi = $lista($in['strazi'] ?? []); $subiecte = $lista($in['subiecte'] ?? []);
if (!$strazi && !$subiecte) json_iesire(400, ['eroare' => 'alegeți cel puțin o stradă sau un subiect']);

$fp = blocheaza($F);
$A = citeste($F); $acum = time();
$amp = substr(hash('sha256', ($_SERVER['REMOTE_ADDR'] ?? '') . '|monitor-local-alerte'), 0, 24);
$limF = __DIR__ . '/intern/date/abonati-limite.json'; $lim = citeste($limF);
$t = array_values(array_filter($lim[$amp] ?? [], function ($x) use ($acum) { return $x > $acum - 3600; }));
if (count($t) >= 5) { if ($fp) flock($fp, LOCK_UN); json_iesire(429, ['eroare' => 'prea multe abonări de la această adresă; încercați peste o oră']); }
$t[] = $acum; $lim = array_filter($lim, function ($v) use ($acum) { return is_array($v) && max($v) > $acum - 3600; }); $lim[$amp] = $t; scrie($limF, $lim);
if (!isset($A[$email]) && count($A) >= MAX_ABONATI) { if ($fp) flock($fp, LOCK_UN); json_iesire(503, ['eroare' => 'lista e plină deocamdată']); }
$vechi = $A[$email] ?? null;
if ($vechi && !empty($vechi['confirmat'])) {   // deja abonat: adăugăm alegerile noi, fără reconfirmare
  $A[$email]['strazi'] = array_slice(array_values(array_unique(array_merge($vechi['strazi'] ?? [], $strazi))), 0, 10);
  $A[$email]['subiecte'] = array_slice(array_values(array_unique(array_merge($vechi['subiecte'] ?? [], $subiecte))), 0, 10);
  scrie($F, $A); if ($fp) flock($fp, LOCK_UN);
  json_iesire(200, ['ok' => true, 'deja' => true]);
}
if ($vechi && ($vechi['trimis_confirmare'] ?? 0) > $acum - 600) { if ($fp) flock($fp, LOCK_UN); json_iesire(429, ['eroare' => 'v-am trimis deja e-mailul de confirmare; verificați și în Spam']); }
$cod = bin2hex(random_bytes(16));
$A[$email] = ['cod' => $cod, 'strazi' => $strazi, 'subiecte' => $subiecte, 'creat' => $acum, 'trimis_confirmare' => $acum, 'confirmat' => false, 'trimis' => []];
scrie($F, $A); if ($fp) flock($fp, LOCK_UN);
$ok = trimite_mail($email, 'Confirmați abonarea la Monitor local',
  "Bună ziua,\n\nCineva (probabil dumneavoastră) a cerut alerte pe e-mail de la Monitor local, pentru: " . implode(', ', array_merge($strazi, $subiecte)) . ".\n\n"
  . "Confirmați cu un click: " . SITE . "alerte.php?confirma=" . $cod . "\n\nDacă nu ați cerut asta, ignorați mesajul: fără confirmare, adresa se șterge în 7 zile.\n\n"
  . "Păstrăm doar adresa și alegerile dumneavoastră, ca să vă trimitem noutățile; nu le dăm nimănui. Vă puteți dezabona oricând, din orice e-mail.\n\nMonitor local, un proiect al Asociației Rădăuțiul Civic\n");
if (!$ok) json_iesire(502, ['eroare' => 'e-mailul de confirmare nu a putut fi trimis; încercați mai târziu']);
json_iesire(200, ['ok' => true]);
