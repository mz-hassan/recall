import React from 'react';

export function CourseGraphButton({ courseId }) {
  return <a className="secondary" href={'#graph/' + courseId}>Knowledge graph ↗</a>;
}
