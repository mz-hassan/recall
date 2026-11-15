export function mergeNotesCatalog(courses,records){
  return courses.map(course=>{
    const saved=records.filter(note=>note.courseId===course.id);
    const lectures=course.lectures.map(lecture=>{
      const note=saved.find(note=>note.lectureId===lecture.id);
      return note?{...lecture,notesAvailable:true,notesBasis:note.basis,...(course.id==='cv'?{title:note.title,date:'',courseId:'cv',courseName:course.name,courseCode:course.code,teacher:'Course recording'}:{})}:lecture;
    });
    for(const note of saved)if(!lectures.some(lecture=>lecture.id===note.lectureId))lectures.push({id:note.lectureId,number:Number(note.lectureId),title:note.title,date:'',courseId:course.id,courseName:course.name,courseCode:course.code,teacher:'Course recording',notesAvailable:true,notesBasis:note.basis,replay:false});
    return {...course,lectures:lectures.sort((a,b)=>Number(a.id)-Number(b.id))};
  });
}
export function noteSources(records,existing){
  const result=[];
  for(const note of records){const seen=new Set();for(const source of note.sources??[]){
    const key=source.url||source.path;if(seen.has(key)||existing.some(item=>item.course===note.courseId&&item.lecture===note.lectureId&&item.url===source.url&&source.url))continue;seen.add(key);
    result.push({id:'prepared-'+note.courseId+'-'+note.lectureId+'-'+source.id,course:note.courseId,lecture:note.lectureId,title:source.title,
      kind:source.kind==='slides'?'Slides':source.kind==='reading'?'Required':'Website',url:source.url||'/api/prepared/lectures/'+note.courseId+'/'+note.lectureId+'/sources/'+source.id});
  }}return result;
}
