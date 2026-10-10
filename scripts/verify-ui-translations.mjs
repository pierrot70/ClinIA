#!/usr/bin/env node
// Static inventory only. No services, patient records, or translation API calls.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.join(root, 'frontend/package.json'));
const ts = require('typescript');
export const UI_AUDIT_SCOPE = 'frontend-renderers';
export const UI_AUDIT_SCHEMA_VERSION = 2;
const uiAttributes = new Set(['title', 'alt', 'placeholder', 'aria-label', 'aria-description', 'label', 'description', 'caption', 'helperText', 'emptyText', 'loadingText', 'errorMessage', 'successMessage', 'confirmText', 'cancelText']);
const proseProperties = /^(?:label|title|description|caption|message|placeholder|helperText|emptyText|loadingText|errorMessage|successMessage|confirmText|cancelText)$/i;
const messageSink = /^(?:set[A-Za-z0-9]*(?:Error|Success|Message|Notice|Warning|Feedback)|(?:window\.)?(?:alert|confirm|prompt)|toast(?:\.(?:error|success|info|warning))?|showToast|notify)$/;
const technical = new Set(['ClinIA', 'RAMQ', 'MFA', 'JWT', 'SMTP', 'MongoDB', 'OpenAI', 'API', 'HTTP', 'HTTPS', 'JSON', 'CSV', 'PDF', 'ID', 'OK', 'CA', 'QC', 'kg', 'cm', 'mm', 'm', 'mg', 'g', 'ml', 'mL', 'L', 'mmHg', 'bpm', 'Hz', 'kPa', '°C', 'UI', 'min', 'ms', 's', 'h', 'lag', 'Transport', 'Docker']);
const normalize = value => value.replace(/\s+/g, ' ').trim();
const machineMessageKeys = new Set(['error', 'saved', 'loadError']);
function meaningful(value) {
 const text = normalize(value);
 const tokens = text.replace(/\$\{…\}/g, '').replace(/[,:;/|°()+·•–—-]/g, ' ').split(/\s+/).filter(Boolean);
 if(tokens.length && tokens.every(token => technical.has(token) || /^[A-Z][A-Z0-9_]*$/.test(token) || /^\d+(?:[.,]\d+)?$/.test(token))) return false;
 if(/^(?:[a-z][a-z0-9.-]+\.[a-z]{2,}\/\S*|[A-Za-z_]+\/[A-Za-z_]+|gpt-[\w.-]+)$/.test(text))return false;
 return /\p{L}/u.test(text) && !technical.has(text) && !/^[A-Z][A-Z0-9_]*$/.test(text) && !/^(?:https?:|mailto:|tel:|\/|\.\/?|#|data:|mongodb:)/.test(text) && !/^[\w.+-]+@[\w.-]+\.[\w-]+$/.test(text) && !/^\d+(?:[.,]\d+)?\s*(?:kg|mg|cm|mm|ml|mL|L|%|h|min|s)$/.test(text);
}
function frenchProse(value) {
 const text=normalize(value);
 return meaningful(text) && (/[àâçéèêëîïôùûüœ]/i.test(text) || /\b(?:le|la|les|une?|des|du|votre|vous|erreur|impossible|chargement|connexion|aucun|aucune|patient|patients|medecin|mot de passe|reinitialisation|enregistrer|supprimer|annuler|fermer|retour|choisir|afficher|rechercher|administration|utilisateur|utilisateurs|adresse|telephone|email|nom|prenom|resultat|resultats|date|accueil|parametres|reception|confirmer|details)\b/i.test(text));
}
function literal(node) {
 return ts.isStringLiteralLike(node) || ts.isNoSubstitutionTemplateLiteral(node) ? node.text : ts.isTemplateExpression(node) ? [node.head.text,...node.templateSpans.map(s=>s.literal.text)].join(' ${…} ') : null;
}
function codeSample(node) {
 for(let parent=node.parent;parent;parent=parent.parent){
  if(ts.isJsxElement(parent) && /^(?:code|pre)$/.test(parent.openingElement.tagName.getText()))return true;
 }
 return false;
}
function translated(node) {
 // Recognize calls, not arbitrary variable names. Imported catalog values are
 // outside this literal detector; their completeness requires runtime tests.
 if(!node)return false;
 if(ts.isCallExpression(node) && /^(?:t|translate|localize|Label|\w*Label|\w*Translation|useUiLabelTree|translateUiLabelTree|getLocalUiMessage)$/.test(node.expression.getText()))return true;
 return false;
}
export function inspectSource(file, source) {
 const tree=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true,/\.(?:tsx|jsx)$/.test(file)?ts.ScriptKind.TSX:ts.ScriptKind.TS);
 const findings=[],warnings=[],seen=new Set(), declarations=new Map(), registryImports=new Set(), catalogProviders=new Set(), enumStates=[];
 for(const statement of tree.statements)if(ts.isImportDeclaration(statement)&& /(?:^|\/)uiLabels(?:\.fr)?$/.test(statement.moduleSpecifier.text)){const bindings=statement.importClause?.namedBindings;if(bindings&&ts.isNamedImports(bindings))for(const entry of bindings.elements)if(['labels','UI_LABELS_FR'].includes(entry.propertyName?.text||entry.name.text))registryImports.add(entry.name.text);}
 for(const statement of tree.statements)if(ts.isImportDeclaration(statement)&& /\/i18n\//.test(statement.moduleSpecifier.text)){const bindings=statement.importClause?.namedBindings;if(bindings&&ts.isNamedImports(bindings))for(const entry of bindings.elements)if(/Labels$/.test(entry.propertyName?.text||entry.name.text))catalogProviders.add(entry.name.text);}
 const scopeOf=node=>{for(let p=node.parent;p;p=p.parent)if(ts.isBlock(p)||ts.isSourceFile(p))return p;return tree;};
 function collect(node){if(ts.isVariableDeclaration(node)&&ts.isIdentifier(node.name)&&node.initializer){const scope=scopeOf(node);if(!declarations.has(scope))declarations.set(scope,new Map());declarations.get(scope).set(node.name.text,node.initializer);}ts.forEachChild(node,collect);}
 collect(tree);
 function resolve(identifier){for(let p=identifier.parent;p;p=p.parent){const initializer=declarations.get(p)?.get(identifier.text);if(initializer)return initializer;}return null;}
 function rawRegistry(node,resolving=new Set()){
  if(!node||translated(node)||resolving.has(node))return null;
  const next=new Set(resolving);next.add(node);
  if(ts.isIdentifier(node)){const init=resolve(node);return init?rawRegistry(init,next):registryImports.has(node.text)?node.text:null;}
  if(ts.isPropertyAccessExpression(node)||ts.isElementAccessExpression(node)){const base=rawRegistry(node.expression,next);return base?`${base}.${ts.isPropertyAccessExpression(node)?node.name.text:node.argumentExpression.getText(tree)}`:null;}
  if(ts.isParenthesizedExpression(node)||ts.isAsExpression(node)||ts.isNonNullExpression(node))return rawRegistry(node.expression,next);
  if(ts.isCallExpression(node)&&ts.isPropertyAccessExpression(node.expression)&&['replace','replaceAll','concat','join','toUpperCase','toLowerCase'].includes(node.expression.name.text))return rawRegistry(node.expression.expression,next);
  return null;
 }
 function fromCatalog(node,seenNodes=new Set()) {
  if(!node||seenNodes.has(node))return false;
  const next=new Set(seenNodes);next.add(node);
  if(ts.isIdentifier(node))return fromCatalog(resolve(node),next)||registryImports.has(node.text);
  if(ts.isPropertyAccessExpression(node)||ts.isElementAccessExpression(node))return fromCatalog(node.expression,next);
  return ts.isCallExpression(node)&&(catalogProviders.has(node.expression.getText(tree))||node.expression.getText(tree)==='useUiLabelTree');
 }
 // Only a typed finite state used as a catalog index proves that setter strings
 // are keys. The same spelling without both pieces of evidence stays a violation.
 function collectEnumStates(node) {
  if(ts.isVariableDeclaration(node)&&ts.isArrayBindingPattern(node.name)&&node.name.elements.length===2&&node.initializer&&ts.isCallExpression(node.initializer)&&node.initializer.expression.getText(tree)==='useState') {
   const [state,setter]=node.name.elements, type=node.initializer.typeArguments?.[0];
   const variants=type&&ts.isUnionTypeNode(type)?type.types:type?[type]:[];
   const strings=variants.filter(v=>ts.isLiteralTypeNode(v)&&ts.isStringLiteral(v.literal));
   if(ts.isBindingElement(state)&&ts.isIdentifier(state.name)&&ts.isBindingElement(setter)&&ts.isIdentifier(setter.name)&&strings.length&&variants.every(v=>ts.isLiteralTypeNode(v)&&(ts.isStringLiteral(v.literal)||v.literal.kind===ts.SyntaxKind.NullKeyword)))enumStates.push({state:state.name.text,setter:setter.name.text,scope:scopeOf(node),keys:new Set(strings.map(v=>v.literal.text)),indexed:false});
  }
  ts.forEachChild(node,collectEnumStates);
 }
 collectEnumStates(tree);
 function visibleEnum(node,stateOrSetter,field) {
  for(let p=node.parent;p;p=p.parent){const candidate=enumStates.find(s=>s.scope===p&&s[field]===stateOrSetter);if(candidate)return candidate;}
  return null;
 }
 function collectCatalogIndices(node) {
  if(ts.isElementAccessExpression(node)&&node.argumentExpression&&ts.isIdentifier(node.argumentExpression)&&fromCatalog(node.expression)){
   const state=visibleEnum(node.argumentExpression,node.argumentExpression.text,'state');if(state)state.indexed=true;
  }
  ts.forEachChild(node,collectCatalogIndices);
 }
 collectCatalogIndices(tree);
 function enumSelectorCall(node,arg){const state=visibleEnum(node,node.expression.getText(tree),'setter');const value=literal(arg);return Boolean(state?.indexed&&value!==null&&state.keys.has(value));}
 function add(node,kind,text,details,severity='violation'){
  const normalized=normalize(text);const key=`${node.pos}:${kind}`;if(seen.has(key))return;seen.add(key);
  const location=tree.getLineAndCharacterOfPosition(node.getStart(tree));
  const id=createHash('sha256').update(`${file}\0${kind}\0${normalized}`).digest('hex');
  if(['inline-ui-property','inline-ui-variable','message-source-review'].includes(kind))severity='review';
  (severity==='review'?warnings:findings).push({id,kind,severity,line:location.line+1,column:location.character+1,text:normalized,...(details?{details}:{})});
 }
 function scanLiterals(node,kind,filter=meaningful,resolving=new Set()){
  if(!node||translated(node)||codeSample(node))return;
  const registry=['jsx-expression','ui-attribute'].includes(kind)?rawRegistry(node):null;if(registry){add(node,'raw-registry-label',node.getText(tree),`Versioned French source rendered without a translation adapter: ${registry}`);return;}
  if(ts.isIdentifier(node)){const initializer=resolve(node);if(initializer&&!resolving.has(initializer)){const next=new Set(resolving);next.add(initializer);scanLiterals(initializer,kind,filter,next);}return;}
  const text=literal(node);if(text!==null){if(filter(text))add(node,kind,text);return;}
  // Only displayed values in expressions, never comparison operands, map keys,
  // callback body logic, function arguments to translators, or computed data.
  if(ts.isConditionalExpression(node)){scanLiterals(node.whenTrue,kind,filter,resolving);scanLiterals(node.whenFalse,kind,filter,resolving);return;}
  if(ts.isBinaryExpression(node) && [ts.SyntaxKind.BarBarToken,ts.SyntaxKind.QuestionQuestionToken,ts.SyntaxKind.AmpersandAmpersandToken,ts.SyntaxKind.PlusToken].includes(node.operatorToken.kind)){scanLiterals(node.left,kind,filter,resolving);scanLiterals(node.right,kind,filter,resolving);return;}
  if(ts.isParenthesizedExpression(node)||ts.isAsExpression(node)||ts.isNonNullExpression(node))scanLiterals(node.expression,kind,filter,resolving);
 }
 function visit(node){
  if(ts.isJsxText(node) && !codeSample(node) && meaningful(node.text))add(node,'jsx-text',node.text);
  if(ts.isJsxAttribute(node) && uiAttributes.has(node.name.getText()) && node.initializer){
   const value=ts.isJsxExpression(node.initializer)?node.initializer.expression:node.initializer;
   const placeholderExample=node.name.getText()==='placeholder'&&literal(value)!==null&&/^(?:507f\.\.\.|abc123|req_\d+|[a-z]+(?:_[a-z]+)+|(?:Ex:\s*)?ad\*{2,})$/.test(literal(value));
   if(!placeholderExample)scanLiterals(value,'ui-attribute');
  }
  if(ts.isJsxExpression(node) && node.expression && !ts.isJsxAttribute(node.parent))scanLiterals(node.expression,'jsx-expression');
  if(ts.isPropertyAssignment(node) && proseProperties.test(node.name.getText().replace(/^['"]|['"]$/g,'')))scanLiterals(node.initializer,'inline-ui-property',frenchProse);
  if(ts.isVariableDeclaration(node) && /(?:Label|Title|Message|Caption|Placeholder|Error|Success)\d*$/.test(node.name.getText()) && node.initializer)scanLiterals(node.initializer,'inline-ui-variable',frenchProse);
  if(ts.isCallExpression(node) && messageSink.test(node.expression.getText()) && node.arguments[0]){
   const arg=node.arguments[node.expression.getText()==='showToast'&&node.arguments.length>1?1:0];
   // State keys are selectors, not user-facing text. UiMessage localizes message
   // state at rendering; raw server sources still appear in reviewWarnings.
   const sink=node.expression.getText();
   const state=sink.startsWith('set')?sink.slice(3).replace(/^./,c=>c.toLowerCase()):null;
   const wrappedState=state&&new RegExp(`<UiMessage\\s[^>]*message=\\{\\s*${state}(?:[.\\s}])`).test(source);
   if(wrappedState)scanLiterals(arg,'message-source-review');
   if(!wrappedState&&!enumSelectorCall(node,arg)&&!(sink==='setMessage'&&literal(arg)!==null&&machineMessageKeys.has(literal(arg))))scanLiterals(arg,'message-literal');
   // An API error's text is not a UI catalog entry. This is a reviewable static
   // source warning, never a claim that runtime backend output is always French.
   const raw=arg.getText(tree);
   if(!translated(arg) && /(?:\.error(?:\.message)?\b|\b(?:err|error)\??\.message\b)/.test(raw))add(arg,'backend-message-source-review',raw,wrappedState?'Message state is rendered through UiMessage; review mapping/fallback coverage.':'Inspect rendered destination and local UI mapping; static source alone does not prove untranslated output.','review');
  }
  ts.forEachChild(node,visit);
 }
 visit(tree);
 const parseErrors=tree.parseDiagnostics.map(d=>({line:tree.getLineAndCharacterOfPosition(d.start||0).line+1,message:ts.flattenDiagnosticMessageText(d.messageText,' ')}));
 return {file,status:parseErrors.length?'parse-error':findings.length?'findings':warnings.length?'review-only':'static-no-findings',scope:'AST literal/message-source inventory; runtime language and state coverage not validated',i18nReferences:[...new Set((source.match(/\b(?:useTranslation|useHomeI18n|useUiTranslation|useUiLabels|useUiLabelTree|UiMessage|UI_LABELS_FR)\b/g)||[]))],findings,reviewWarnings:warnings,parseErrors};
}
function filesUnder(directory){
 return fs.readdirSync(directory,{withFileTypes:true}).flatMap(entry=>{const target=path.join(directory,entry.name);return entry.isDirectory()?filesUnder(target):/\.(?:tsx?|jsx?)$/.test(entry.name)&&!/(?:\.test\.|\.spec\.|\.d\.ts$)/.test(entry.name)?[target]:[];});
}
// Dialogs can be rendered by hooks, auth providers, contexts and the app entry,
// not only by files stored under pages/ or components/.
export function uiRendererFiles(sourceRoot) {
 return filesUnder(sourceRoot).filter(file=>/\.(?:tsx|jsx)$/.test(file)||/^(?:pages|components)\//.test(path.relative(sourceRoot,file).split(path.sep).join('/')));
}
function occurrences(files){const counts=new Map();for(const file of files)for(const finding of file.findings){const existing=counts.get(finding.id)||{id:finding.id,file:file.file,kind:finding.kind,text:finding.text,count:0};existing.count++;counts.set(finding.id,existing);}return [...counts.values()].sort((a,b)=>a.file.localeCompare(b.file)||a.id.localeCompare(b.id));}
export function compareBaseline(current,baseline){
 if(baseline.schemaVersion!==UI_AUDIT_SCHEMA_VERSION || baseline.scope!==UI_AUDIT_SCOPE || !Array.isArray(baseline.debt))throw new Error('Invalid explicit debt baseline');
 const accepted=new Map();for(const entry of baseline.debt){if(accepted.has(entry.id)||!Number.isInteger(entry.count)||entry.count<1||typeof entry.reason!=='string'||!entry.reason.trim())throw new Error('Invalid baseline multiplicity');accepted.set(entry.id,entry.count);}
 return current.filter(entry=>entry.count>(accepted.get(entry.id)||0)).map(entry=>({...entry,newOccurrences:entry.count-(accepted.get(entry.id)||0)}));
}
function main(args){
 const options={};for(let i=0;i<args.length;i++){const arg=args[i];if(['--output','--baseline','--write-baseline'].includes(arg)){if(!args[i+1]||args[i+1].startsWith('--'))throw new Error(`Missing value ${arg}`);options[arg]=args[++i];}else if(arg==='--check')options[arg]=true;else throw new Error(`Unknown option ${arg}`);}
 if(options['--check']&&!options['--baseline'])throw new Error('--check requires an explicit --baseline');
 if(options['--write-baseline']&&options['--check'])throw new Error('Baseline creation cannot silently accept new debt during a CI check');
 const files=uiRendererFiles(path.join(root,'frontend/src')).sort().map(file=>inspectSource(path.relative(root,file).split(path.sep).join('/'),fs.readFileSync(file,'utf8')));
 const debt=occurrences(files),newViolations=options['--baseline']?compareBaseline(debt,JSON.parse(fs.readFileSync(options['--baseline'],'utf8'))):debt;
 const report={schemaVersion:UI_AUDIT_SCHEMA_VERSION,scope:UI_AUDIT_SCOPE,method:'TypeScript AST; no runtime or human validation',limitations:['No interprocedural dataflow or catalog completeness proof.','Dynamic patient/clinical values are intentionally excluded.','Code/pre samples, technical role tokens, units and URIs are excluded.','Calls to translators are not proof of available translations.','Mocked page/language/state rendering and human review remain required.'],summary:{files:files.length,filesWithFindings:files.filter(f=>f.findings.length).length,findings:files.reduce((n,f)=>n+f.findings.length,0),reviewWarnings:files.reduce((n,f)=>n+f.reviewWarnings.length,0),parseErrors:files.reduce((n,f)=>n+f.parseErrors.length,0),newOccurrences:newViolations.reduce((n,f)=>n+(f.newOccurrences ?? f.count),0)},files,newViolations};
 if(options['--write-baseline'])fs.writeFileSync(options['--write-baseline'],JSON.stringify({schemaVersion:UI_AUDIT_SCHEMA_VERSION,scope:UI_AUDIT_SCOPE,purpose:'Reviewed non-translatable exceptions only. Every entry requires a reason; observed debt is never accepted automatically.',debt:[]},null,2)+'\n');
 const output=JSON.stringify(report,null,2)+'\n';if(options['--output'])fs.writeFileSync(options['--output'],output);else process.stdout.write(output);
 if(options['--check']&&(newViolations.length||report.summary.parseErrors))process.exitCode=1;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){try{main(process.argv.slice(2));}catch(error){console.error(error.message);process.exitCode=2;}}
