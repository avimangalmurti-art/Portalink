/** Keep transient full-resolution decoding bounded across dense document grids. */
export type PageRenderTask<T = void> = { promise: Promise<T>; cancel: () => void };
export function createPageRenderQueue(limit = 2) {
 let active = 0, pumping = false;
 const waiting: Array<() => void> = [];
 const pump = () => {if(pumping)return; pumping=true;try{while(active < limit && waiting.length)waiting.shift()?.();}finally{pumping=false;}};
 return function schedule<T>(start: () => PageRenderTask<T>): PageRenderTask<T> {
  let task: PageRenderTask<T> | undefined, cancelled = false, started = false;
  let resolve!: (value: T) => void, reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  const run = () => {
   if (cancelled) return;
   started = true; active++;
   const finish = () => { active--; pump(); };
   try { task = start(); task.promise.then(value => { resolve(value); finish(); }, error => { reject(error); finish(); }); }
   catch (error) { reject(error); finish(); }
  };
  waiting.push(run); pump();
  return { promise, cancel() {
   if (cancelled) return;
   cancelled = true;
   if (started) task?.cancel();
   else { const index = waiting.indexOf(run); if (index >= 0) waiting.splice(index, 1); const error = new Error('Page render cancelled'); error.name = 'RenderingCancelledException'; reject(error); }
  }};
 };
}
export const queuePageRender = createPageRenderQueue();
