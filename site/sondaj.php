<?php
/* Sondajele de lângă proiectele de hotărâre în consultare publică (Monitor local, zona publică).
   „Ești de acord cu proiectul?” Da / Nu / Nu știu. Nu are valoare juridică: arată doar interesul vizitatorilor.
   Voturile stau în intern/date/sondaje.json (folderul cu parolă): pentru fiecare proiect, amprenta adresei IP (nu adresa)
   și răspunsul; de pe aceeași adresă se poate vota o dată pe proiect (votul se poate schimba).
   GET  -> {"nr proiect": {"da": n, "nu": n, "ns": n}}
   POST {"p": "nr proiect", "v": "da|nu|ns"} -> cifrele proiectului și votul tău */

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

function iesire($cod, $d) { http_response_code($cod); echo json_encode($d, JSON_UNESCAPED_UNICODE); exit; }
function citeste($f) { if (!is_file($f)) return []; $d = json_decode(file_get_contents($f), true); return is_array($d) ? $d : []; }
function scrie($f, $d) {
  if (!is_dir(dirname($f))) mkdir(dirname($f), 0755, true);
  $tmp = $f . '.' . getmypid() . '.tmp';
  if (file_put_contents($tmp, json_encode($d, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), LOCK_EX) === false) iesire(500, ['eroare' => 'votul nu a putut fi salvat']);
  rename($tmp, $f);
}
function cifre($voturi) { $c = ['da' => 0, 'nu' => 0, 'ns' => 0]; foreach ($voturi as $v) if (isset($c[$v])) $c[$v]++; return $c; }

$F = __DIR__ . '/intern/date/sondaje.json';
$amp = substr(hash('sha256', ($_SERVER['REMOTE_ADDR'] ?? '') . '|monitor-local-sondaj'), 0, 24);

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
  $out = []; $al = [];
  foreach (citeste($F) as $p => $voturi) { if ($p === '_limite') continue; $out[$p] = cifre($voturi); if (isset($voturi[$amp])) $al[$p] = $voturi[$amp]; }
  iesire(200, ['cifre' => $out, 'votul_tau' => $al]);
}
if ($_SERVER['REQUEST_METHOD'] !== 'POST') iesire(405, ['eroare' => 'metodă nepermisă']);
$orig = $_SERVER['HTTP_ORIGIN'] ?? ($_SERVER['HTTP_REFERER'] ?? '');
if (!preg_match('#^https://(www\.)?monitor\.radautiulcivic\.ro(/|$)#', $orig)) iesire(403, ['eroare' => 'cerere refuzată']);
$in = json_decode(file_get_contents('php://input', false, null, 0, 2000), true);
$p = strval($in['p'] ?? ''); $v = strval($in['v'] ?? '');
if (!preg_match('/^[\w.\-]{1,40}$/', $p) || !in_array($v, ['da', 'nu', 'ns'], true)) iesire(400, ['eroare' => 'date invalide']);

if (!is_dir(dirname($F))) mkdir(dirname($F), 0755, true);
$fp = fopen($F . '.lock', 'c'); if ($fp) flock($fp, LOCK_EX);   // un singur vot scris odată
$S = citeste($F);
$acum = time();
$lim = array_values(array_filter($S['_limite'][$amp] ?? [], function ($t) use ($acum) { return $t > $acum - 3600; }));
if (count($lim) >= 40) { if ($fp) flock($fp, LOCK_UN); iesire(429, ['eroare' => 'prea multe voturi într-o oră; încearcă mai târziu']); }
$lim[] = $acum;
$S['_limite'] = array_filter($S['_limite'] ?? [], function ($t) use ($acum) { return is_array($t) && max($t) > $acum - 3600; });
$S['_limite'][$amp] = $lim;
if (!isset($S[$p]) && count($S) > 500) { if ($fp) flock($fp, LOCK_UN); iesire(400, ['eroare' => 'prea multe sondaje']); }
$S[$p] = $S[$p] ?? [];
$S[$p][$amp] = $v;
scrie($F, $S);
if ($fp) flock($fp, LOCK_UN);
iesire(200, ['ok' => true, 'cifre' => cifre($S[$p]), 'votul_tau' => $v]);
