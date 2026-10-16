import { createElement, useEffect, useRef, useState } from 'react';
import { api } from '../api';
import { useStore } from '../store';
import { useValueUndo } from '../useValueUndo';
import { archiveRequest, waitArchive } from '../archiveJobs';
import type { EditionCatalog, EditionPreview, EditionRecipe, StudioBlock } from '../../../shared/story-edition';

function formatted(block: StudioBlock) {
  if (block.type === 'divider') return <hr key={block.id} />;
  const points = [...new Set([0, block.text.length, ...block.marks.flatMap(mark => [mark.start, mark.end])])].sort((a,b) => a-b);
  return createElement(block.type === 'heading' ? `h${block.level || 2}` : 'p', { key: block.id, className: 'edition-passage' }, points.slice(1).map((end, index) => {
    const start = points[index]; let node = <span key={start}>{block.text.slice(start,end)}</span>;
    for (const kind of ['italic','bold']) if (block.marks.some(mark => mark.kind === kind && mark.start <= start && mark.end >= end)) node = kind === 'bold' ? <strong key={start}>{node}</strong> : <em key={start}>{node}</em>;
    return node;
  }));
}
export function StoryStudioExport({ projectId, projectName, onDirty, onPending }: {
  projectId: string; projectName: string; onDirty: (value:boolean)=>void; onPending: (value:boolean)=>void;
}) {
  const [catalog,setCatalog] = useState<EditionCatalog>({documents:[],images:[]});
  const [recipes,setRecipes] = useState<EditionRecipe[]>([]);
  const [recipe,setRecipe] = useState<EditionRecipe>({version:1,id:crypto.randomUUID(),title:projectName,author:'',documentIds:[],images:[]});
  const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[dirty,setDirty]=useState(false);
  const [error,setError]=useState(''),[message,setMessage]=useState('');
  const [preview,setPreview]=useState<EditionPreview|null>(null),[ack,setAck]=useState(false);
  const alive=useRef(true), generation=useRef(0), jobs=useRef(new Set<string>());
  async function discard(id:string) { await fetch(`/api/archive-jobs/${id}`,{method:'DELETE'}).catch(()=>{});jobs.current.delete(id); }
  useEffect(()=>{
    alive.current=true;let current=true;
    Promise.all([api.editionCatalog(projectId),api.editions(projectId)]).then(([catalog,store])=>{
      if(!current)return;setCatalog(catalog);setRecipes(store.recipes);
      if(store.recipes[0])setRecipe(store.recipes[0]);else {setRecipe(value=>({...value,documentIds:catalog.documents.map(doc=>doc.id)}));setDirty(true);}
    }).catch(error=>{if(current)setError(error.message)}).finally(()=>{if(current)setLoading(false)});
    return()=>{current=false;alive.current=false;generation.current++;for(const id of jobs.current)void discard(id)};
  },[projectId]);
  useEffect(()=>onDirty(dirty),[dirty,onDirty]);useEffect(()=>onPending(loading||busy),[loading,busy,onPending]);
  const edits=useValueUndo(recipe,value=>{setRecipe(value);setDirty(true);setPreview(null);setAck(false);setMessage('')});
  const change=edits.change;
  async function flush() {
    const store=useStore.getState();await Promise.all(Object.keys(store.docs).map(id=>store.flushDoc(id)));
    if(useStore.getState().project?.id!==projectId)throw new Error('Project changed. Reopen Story Studio export.');
    if(Object.values(useStore.getState().docs).some(doc=>doc.dirty||doc.recovery||doc.applyingPatch))throw new Error('Save writing and resolve recovered drafts before exporting.');
  }
  async function save() {
    const saved=(await api.saveEdition(projectId,recipe)).recipe;
    if(!alive.current)return;setRecipe(saved);setDirty(false);setRecipes(values=>[...values.filter(value=>value.id!==saved.id),saved]);
  }
  async function run(work:(token:number)=>Promise<void>) {
    if(busy)return;const token=++generation.current;setBusy(true);setError('');setMessage('');
    try{await work(token)}catch(error:any){if(alive.current&&generation.current===token)setError(error.message)}finally{if(alive.current&&generation.current===token)setBusy(false)}
  }
  async function prepare(mode:'preview'|'export',token:number) {
    await flush();await save();
    for(const id of [...jobs.current])await discard(id);
    const job=await archiveRequest(`/api/projects/${projectId}/editions/${mode}-jobs`,{recipe,...(mode==='export'?{snapshotHash:preview?.snapshotHash,acknowledgeWarnings:ack}:{})});
    jobs.current.add(job.id);
    if(!alive.current||generation.current!==token){await discard(job.id);return;}
    try {
      const ready=await waitArchive(job,()=>alive.current&&generation.current===token,status=>setMessage(`Preparing ${mode}: ${status.state}…`));
      if(mode==='preview'){
        const response=await fetch(ready.editionPreviewUrl!);if(!response.ok)throw new Error('Preview expired. Prepare it again.');
        const data:EditionPreview=await response.json();if(alive.current&&generation.current===token){setPreview(data);setAck(false);setMessage('Preview ready. Review chapters, images, and any formatting changes.');}
        await discard(job.id);
      }else{
        const link=document.createElement('a');link.href=ready.downloadUrl!;link.download=`${projectId}.storyweaver.json`;document.body.append(link);link.click();link.remove();
        setMessage('Download requested. In Story Studio, choose Import and select the .storyweaver.json file. Existing Studio projects remain separate.');
      }
    }catch(error){await discard(job.id);throw error}
  }
  function moveDocument(index:number,delta:number){const documentIds=[...recipe.documentIds];[documentIds[index],documentIds[index+delta]]=[documentIds[index+delta],documentIds[index]];change({...recipe,documentIds})}
  function loadRecipe(next:EditionRecipe,unsaved:boolean){edits.reset();setRecipe(next);setDirty(unsaved);setPreview(null);setAck(false);setMessage('');setError('')}
  function selectRecipe(id:string){if(dirty&&!confirm('Discard unsaved edition changes?'))return;const selected=recipes.find(value=>value.id===id);if(selected)loadRecipe(selected,false)}
  return <div className="binder-columns edition-columns">
    <div className="binder-editor" onKeyDown={busy||loading?undefined:edits.onKeyDown}>
      <p>Send selected saved chapters and chosen images to Story Studio. Each document becomes one scene in a separate adaptation. Muse remains your writing source.</p>
      <p>Save unfinished card forms first. Notes, research, browser-only drafts, and credentials are excluded. Portable edition limit: 64 MiB.</p>
      {error&&<p role="alert" className="tool-warning">{error}</p>}{message&&<p role="status">{message}</p>}
      {busy&&<button onClick={()=>{generation.current++;for(const id of jobs.current)void discard(id);setBusy(false);setMessage('Operation cancelled.');}}>Cancel preparation</button>}
      <fieldset disabled={busy||loading}>
        <div className="tool-actions"><button disabled={!edits.canUndo} onClick={edits.undo}>Undo edition edit</button><button disabled={!edits.canRedo} onClick={edits.redo}>Redo edition edit</button></div>
        {!!recipes.length&&<label>Saved edition<select value={recipes.some(value=>value.id===recipe.id)?recipe.id:''} onChange={event=>selectRecipe(event.target.value)}><option value="" disabled>Unsaved edition</option>{recipes.map(value=><option key={value.id} value={value.id}>{value.title}</option>)}</select></label>}
        <button onClick={()=>{if(!dirty||confirm('Discard unsaved edition changes?'))loadRecipe({version:1,id:crypto.randomUUID(),title:projectName,author:'',documentIds:[],images:[]},true)}}>New edition</button>
        <label>Edition title<input value={recipe.title} maxLength={500} onChange={event=>change({...recipe,title:event.target.value})}/></label>
        <label>Author<input value={recipe.author} maxLength={500} onChange={event=>change({...recipe,author:event.target.value})}/></label>
        <h3>Choose manuscript documents</h3>
        {!catalog.documents.length&&<p>No saved manuscript documents. Create a manuscript document in Muse first.</p>}
        {catalog.documents.map(doc=><label className="check-row" key={doc.id}><input type="checkbox" checked={recipe.documentIds.includes(doc.id)} onChange={event=>change({...recipe,documentIds:event.target.checked?[...recipe.documentIds,doc.id]:recipe.documentIds.filter(id=>id!==doc.id),images:event.target.checked?recipe.images:recipe.images.filter(image=>image.documentId!==doc.id)})}/>{doc.title}</label>)}
        <h3>Chapter order and images</h3>
        <ol className="edition-chapters">{recipe.documentIds.map((id,index)=>{
          const title=catalog.documents.find(doc=>doc.id===id)?.title||`Missing document: ${id}`;const images=recipe.images.filter(image=>image.documentId===id);
          return <li key={id}><h4>{title}</h4><div className="tool-actions"><button disabled={index===0} aria-label={`Move ${title} earlier`} onClick={()=>moveDocument(index,-1)}>Earlier</button><button disabled={index===recipe.documentIds.length-1} aria-label={`Move ${title} later`} onClick={()=>moveDocument(index,1)}>Later</button></div>
            {images.map((image,imageIndex)=><div className="edition-image" key={image.id}><img loading="lazy" src={catalog.images.find(value=>value.filename===image.filename)?.src} alt={image.alt}/><label>Caption<input aria-label={`Caption ${title} image ${imageIndex+1}`} maxLength={4000} value={image.caption} onChange={event=>change({...recipe,images:recipe.images.map(value=>value.id===image.id?{...value,caption:event.target.value}:value)})}/></label><label>Alternative text<input aria-label={`Alternative text ${title} image ${imageIndex+1}`} maxLength={2000} value={image.alt} onChange={event=>change({...recipe,images:recipe.images.map(value=>value.id===image.id?{...value,alt:event.target.value}:value)})}/></label><div className="tool-actions"><button disabled={imageIndex===0} onClick={()=>{const next=[...recipe.images],a=next.indexOf(image),b=next.indexOf(images[imageIndex-1]);[next[a],next[b]]=[next[b],next[a]];change({...recipe,images:next})}}>Image earlier</button><button onClick={()=>change({...recipe,images:recipe.images.filter(value=>value.id!==image.id)})}>Remove image</button></div></div>)}
            <details><summary>Choose an image for {title}</summary><p>Images follow this document’s text. Select only images intended for readers.</p><div className="edition-image-picker">{catalog.images.map(image=><button key={image.filename} title={image.filename} aria-label={`Add ${image.filename} to ${title}`} onClick={()=>change({...recipe,images:[...recipe.images,{id:crypto.randomUUID(),documentId:id,filename:image.filename,caption:'',alt:''}]})}><img loading="lazy" src={image.src} alt=""/><span>{(image.size/1024/1024).toFixed(2)} MiB</span></button>)}</div>{!catalog.images.length&&<p>No managed images saved in this project.</p>}</details>
          </li>;
        })}</ol>
        <div className="tool-actions"><button disabled={!recipe.documentIds.length} onClick={()=>void run(async()=>{await save();setMessage('Edition recipe saved.');})}>Save edition</button><button disabled={!recipe.documentIds.length} onClick={()=>void run(token=>prepare('preview',token))}>Preview edition</button></div>
        {preview&&<><p>{preview.scenes.length} scenes · {(preview.encodedBytes/1024/1024).toFixed(2)} MiB portable file</p>{preview.warnings.length>0&&<div className="tool-warning"><h3>Formatting changes to review</h3><ul>{preview.warnings.map((warning,index)=><li key={index}><strong>{warning.title}:</strong> {warning.message}</li>)}</ul><label className="check-row"><input type="checkbox" checked={ack} onChange={event=>setAck(event.target.checked)}/>I reviewed these formatting changes.</label></div>}<button disabled={preview.warnings.length>0&&!ack} onClick={()=>void run(token=>prepare('export',token))}>Export to Story Studio</button></>}
      </fieldset>
    </div>
    <section className="binder-preview edition-preview" aria-label="Story Studio preview"><h3>Edition preview</h3>{!preview?<p>Choose chapters and images, then preview the saved selection.</p>:preview.scenes.map(scene=><article key={scene.id}><h2>{scene.title}</h2>{scene.blocks.map(formatted)}{scene.images.map(image=><figure key={image.id}><img loading="lazy" src={image.src} alt={image.alt}/><figcaption>{image.caption}</figcaption></figure>)}</article>)}</section>
  </div>;
}
