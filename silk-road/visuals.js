const reduced=matchMedia('(prefers-reduced-motion: reduce)');
const sections=document.querySelectorAll('.journey-preview,.field-notes .reveal');
if(!reduced.matches&&'IntersectionObserver'in window){
 const observer=new IntersectionObserver(entries=>entries.forEach(entry=>{if(entry.isIntersecting){entry.target.classList.add('is-visible');observer.unobserve(entry.target);}}),{threshold:.08});
 sections.forEach((section,index)=>{section.classList.add('visual-reveal');section.style.transitionDelay=(index%2)*100+'ms';observer.observe(section);});
}
const photos={registan:{title:'Registan Square · Samarkand',alt:'Tiled madrasas and domes around Registan Square in Samarkand',credit:'Gustavo Jeronimo · derivative: MrPanyGoff · CC BY 2.0. Resized from Wikimedia Commons.'},mogao:{title:'Mogao Caves · Dunhuang',alt:'Nine-story pavilion and cliff face at the Mogao Caves near Dunhuang',credit:'慕尼黑啤酒 · CC BY-SA 3.0. Resized from Wikimedia Commons.'}};
const dialog=document.getElementById('photo-viewer');
if(dialog){
 document.querySelectorAll('[data-photo]').forEach(button=>button.addEventListener('click',()=>{
  const key=button.dataset.photo,photo=photos[key];if(!photo)return;
  const image=document.getElementById('photo-viewer-image');image.src='silk-road/images/'+key+'.webp';image.alt=photo.alt;
  document.getElementById('photo-viewer-title').textContent=photo.title;
  document.getElementById('photo-viewer-credit').textContent=photo.credit;
  dialog.showModal();
 }));
 dialog.querySelector('.photo-close').addEventListener('click',()=>dialog.close());
 dialog.addEventListener('click',event=>{if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close();}});
}

// Stop decorative animation work when its section is outside the viewport.
if('IntersectionObserver'in window){const observer=new IntersectionObserver(entries=>entries.forEach(entry=>entry.target.classList.toggle('motion-paused',!entry.isIntersecting)));document.querySelectorAll('.hero,.journey-preview-photo').forEach(el=>observer.observe(el));}
