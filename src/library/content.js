import { courseUrl, datasetLectures, cs50Lectures } from '../lecture/dataset.js';

export const baseCourses=[{id:'ai',name:'AI Alignment',code:'COMPSCI 690S',teacher:'Prof. Scott Niekum',description:'From learning by imitation to learning what we value.',site:courseUrl,lectures:datasetLectures.map(lecture => ({...lecture, subtitle: ({1:'Learning from demonstrations',2:'When imitation fails',3:'Learning through interaction'})[lecture.number] || ''}))},{id:'cv',name:'Computer Vision',code:'COMPSCI 670',teacher:'Fall 2026',description:'A different way of seeing. From pixels to perception.',site:'https://cvl-umass.github.io/cv-fall-2026/',lectures:[{id:'1',title:'Course overview',date:'2026-09-08',subtitle:'An introduction to visual understanding'},{id:'2',title:'Cameras and geometric image formation',date:'2026-09-15',subtitle:'How the world becomes an image'},{id:'3',title:'Light, reflectance, color, and sensors',date:'2026-09-17',subtitle:'From light to pixels'}]}];
const previewSources=[{id:'ai-site',course:'ai',lecture:'all',title:'AI Alignment · course website',kind:'Website',url:baseCourses[0].site},{id:'cv-site',course:'cv',lecture:'all',title:'Computer Vision · course website',kind:'Website',url:baseCourses[1].site},...[
['ai1slides','1','Behavior cloning · lecture slides','Slides','ai-01-slides.pdf','https://people.cs.umass.edu/~sniekum/classes/AIA-F26/lectures/bc.pdf'],['ai1read','1','Behavioral Cloning from Observation','Required','ai-01-reading.pdf','https://arxiv.org/pdf/1805.01954.pdf'],['ai2slides','2','Limitations of behavior cloning · slides','Slides','ai-02-slides.pdf','https://people.cs.umass.edu/~sniekum/classes/AIA-F26/lectures/limitbc.pdf'],['ai2read','2','DAgger · Imitation Learning as No-Regret Online Learning','Required','ai-02-reading.pdf','https://proceedings.mlr.press/v15/ross11a/ross11a.pdf'],['ai3slides','3','Reinforcement learning · lecture slides','Slides','ai-03-slides.pdf','https://people.cs.umass.edu/~sniekum/classes/AIA-F26/lectures/rl.pdf'],['ai3ppo','3','Proximal Policy Optimization Algorithms','Optional','ai-03-ppo.pdf','https://arxiv.org/pdf/1707.06347.pdf']].map(([id,lecture,title,kind,pdf,url])=>({id,course:'ai',lecture,title,kind,pdf:'pdfs/'+pdf,url}))];

baseCourses.push({ id: 'cs50', name: 'CS50: Introduction to Computer Science', code: 'CS50x', teacher: 'David J. Malan',
  term: 'CS50x 2025', description: 'Computational thinking, problem solving, and programming.',
  site: 'https://cs50.harvard.edu/x/2025/', lectures: cs50Lectures });
const cs50Sources = [
  { id: 'cs50-site', lecture: 'all', title: 'CS50 · course website', kind: 'Website', url: baseCourses[2].site },
  { id: 'cs50-0-notes', lecture: '0', title: 'Lecture 0 notes', kind: 'Required', url: 'https://cs50.harvard.edu/x/2025/notes/0/' },
  { id: 'cs50-0-slides', lecture: '0', title: 'Scratch · lecture slides', kind: 'Slides', pdf: '/api/datasets/cs50/lecture0/lecture0.pdf', url: 'https://cdn.cs50.net/2024/fall/lectures/0/lecture0.pdf' },
  { id: 'cs50-0-video', lecture: '0', title: 'Lecture 0 video', kind: 'Website', url: 'https://www.youtube.com/watch?v=2WtPyqwTLKM' },
  { id: 'cs50-0-reference', lecture: '0', title: 'Reference transcript', kind: 'Website', url: '/api/datasets/cs50/lecture0/transcript.txt' },
].map(source => ({ ...source, course: 'cs50' }));

const manifestSources = datasetLectures.flatMap(lecture => [
  ...lecture.readings.map(reading => ({ title: reading.title, kind: reading.kind, url: reading.source_url })),
  { title: lecture.title + ' · slides', kind: 'Slides', url: lecture.slides.source_url },
].filter(source => source.url).map((source, index) => ({
  ...source, course: 'ai', lecture: lecture.id, id: 'ai-' + lecture.id + '-source-' + index,
})).filter(source => !previewSources.some(preview => preview.lecture === source.lecture && preview.url === source.url)));

export const baseSources = [...previewSources, ...manifestSources, ...cs50Sources];
