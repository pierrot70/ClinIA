import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inspectSource, compareBaseline } from './verify-ui-translations.mjs';
const inspect=source=>inspectSource('frontend/src/pages/Example.tsx',source);
test('inventories JSX text, attributes and displayed conditional branches',()=>{
 const report=inspect('const page = <button aria-label="Fermer" title={ready ? "Enregistrer" : "Attendre"}>Connexion {ready ? "Oui" : "Non"}</button>');
 assert.equal(report.status,'findings');assert.equal(report.parseErrors.length,0);
 assert.deepEqual(report.findings.map(f=>f.text).sort(),['Attendre','Connexion','Enregistrer','Fermer','Non','Oui'].sort());
});
test('excludes dynamic patient data, roles, units, URI, code samples and translator arguments',()=>{
 const report=inspect('const page=<><p>{patient.nom} {patient.resultat} {role === "SUPERADMIN" ? labels.admin : labels.user} mg RAMQ</p><a title="https://example.test/">{t("Connexion")}</a><pre>const secret = "exemple";<code>Exemple de code</code></pre></>');
 assert.equal(report.findings.length,0);
});
test('does not suppress a display literal because another branch calls a translator',()=>{
 assert.deepEqual(inspect('const page=<p>{ready ? t("Connexion") : "Erreur de connexion"}</p>').findings.map(f=>f.text),['Erreur de connexion']);
});
test('flags local UI definitions, direct notification messages and raw API errors',()=>{
 const report=inspect('const tabs=[{label:"Administration"},{label:"Gestion des patients"}]; const failureMessage="Erreur réseau"; setError(response.error.message || failureMessage); toast.error("Impossible de charger"); window.confirm("Supprimer le compte ?");');
 assert.ok(report.reviewWarnings.some(f=>f.kind==='inline-ui-property'&&f.text==='Gestion des patients'));
 assert.ok(report.reviewWarnings.some(f=>f.kind==='inline-ui-variable'));
 assert.equal(report.reviewWarnings.filter(f=>f.kind==='backend-message-source-review').length,1);
 assert.equal(report.findings.filter(f=>f.kind==='message-literal').length,3);
});
test('same finding id survives line shifts, while repeated copies increase multiplicity',()=>{
 const source='<p>Connexion</p>';
 assert.equal(inspect(source).findings[0].id,inspect('\n\n'+source).findings[0].id);
 const entry={id:inspect(source).findings[0].id,file:'Example.tsx',kind:'jsx-text',text:'Connexion',count:2};
 const baseline={schemaVersion:1,scope:'pages+components',debt:[{...entry,count:1,reason:'Intentional exception in test'}]};
 assert.equal(compareBaseline([entry],baseline)[0].newOccurrences,1);
 assert.deepEqual(compareBaseline([{...entry,count:1,reason:'Intentional exception in test'}],baseline),[]);
});
test('invalid baseline and parse failures cannot be reported as clean',()=>{
 assert.throws(()=>compareBaseline([],{schemaVersion:1,scope:'pages+components',debt:[{id:'bad',count:0}]}));
 assert.equal(inspect('const page = <div>').status,'parse-error');
});

test('resolves local JSX label variables without following dynamic patient values or cycles',()=>{
 const report=inspect('const banner="Bienvenue"; const value=patient.nom; const circular=other; const other=circular; const page=<p>{banner}{value}{circular}</p>');
 assert.deepEqual(report.findings.map(f=>f.text),['Bienvenue']);
});

test('detects registry aliases at display sinks while translated trees stay safe',()=>{
 const source='import { labels as registry } from "../i18n/uiLabels"; import {UI_LABELS_FR} from "../i18n/uiLabels.fr"; const copy=registry.login; const safe=useUiLabelTree(registry.login); const page=<><p>{copy.title}</p><input placeholder={UI_LABELS_FR.login.title}/><span>{safe.title}{t(registry.login.title)}</span></>';
 const report=inspect(source);
 assert.deepEqual(report.findings.map(f=>f.kind),['raw-registry-label','raw-registry-label']);
 assert.ok(report.findings[0].details.includes('registry.login.title'));
});
test('registry definitions inside translation hook are not rendered violations',()=>{
 const report=inspect('import {labels} from "../i18n/uiLabels"; function useLabels(){const entries={title:labels.login.title}; const {translated:title}=useTranslation({text:entries.title}); return <p>{title}</p>}');
 assert.equal(report.findings.length,0);
});
test('message selectors, toast types, units and identifier placeholders are excluded',()=>{
 const report=inspect('setMessage("saved"); setMessage("error"); setMessage("loadError"); showToast("success",t(labels.saved));const page=<><p>{elapsed} ms min · lag {`${seconds} s`}</p><input placeholder="507f..."/><input placeholder="openai_chat_completions"/><input placeholder="req_123"/><input placeholder="America/Toronto"/><input placeholder="gpt-4.1-mini"/></>');
 assert.equal(report.findings.length,0);
});
test('backend sources remain review warnings with UiMessage rendering evidence',()=>{
 const report=inspect('setError(response.error.message);const page=<UiMessage message={error.message} />');
 assert.equal(report.findings.length,0);assert.equal(report.reviewWarnings.length,1);assert.match(report.reviewWarnings[0].details,/UiMessage/);
});

test('known UiMessage literal state remains inventoried without a false raw-render claim',()=>{
 const report=inspect('setError("Erreur de connexion");const page=<UiMessage message={error} />');
 assert.equal(report.findings.length,0);assert.equal(report.reviewWarnings.length,1);assert.equal(report.reviewWarnings[0].kind,'message-source-review');
});

test('typed state setters used as catalog keys are selectors, not rendered prose',()=>{
 const report=inspect('import {getMyWriteReceiptsLabels} from "../i18n/myWriteReceiptsLabels"; const receiptLabels=getMyWriteReceiptsLabels("en-CA"); function Page(){const [errorKind,setError]=useState<""|"copyError"|"loadError">(""); const error=errorKind?receiptLabels.status[errorKind]:""; setError("copyError");setError("loadError");return <p>{error}</p>}');
 assert.equal(report.findings.length,0);
});
test('same key spelling without typed catalog-index evidence and raw prose stay blocked',()=>{
 const report=inspect('import {getMyWriteReceiptsLabels} from "../i18n/myWriteReceiptsLabels"; const receiptLabels=getMyWriteReceiptsLabels("en-CA"); function Page(){const [errorKind,setError]=useState<""|"copyError"|"loadError">(""); setError("loadError");setError("Erreur de copie");return <p>{errorKind}</p>}');
 assert.deepEqual(report.findings.map(f=>f.text),['loadError','Erreur de copie']);
 const raw=inspect('setError("loadError");');assert.equal(raw.findings.length,1);
 const notCatalog=inspect('function Page(){const [errorKind,setError]=useState<""|"loadError">("");const error=patient.status[errorKind];setError("loadError");return <p>{error}</p>}');assert.equal(notCatalog.findings.length,1);
});
test('catalog enum evidence never exempts a setter literal outside the finite key union',()=>{
 const report=inspect('import {getMyWriteReceiptsLabels} from "../i18n/myWriteReceiptsLabels"; const receiptLabels=getMyWriteReceiptsLabels("en-CA"); function Page(){const [errorKind,setError]=useState<""|"copyError">("");const error=receiptLabels.status[errorKind];setError("Erreur de copie");return <p>{error}</p>}');
 assert.equal(report.findings.length,1);assert.equal(report.findings[0].text,'Erreur de copie');
});
