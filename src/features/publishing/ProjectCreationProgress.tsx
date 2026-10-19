import React from 'react';
import { CheckIcon } from 'lucide-react';
import './project-creation-progress.css';

type CreationStep = 'details' | 'files' | 'review';
const labels: Record<CreationStep, string> = { details: 'Details', files: 'Files', review: 'Review' };
const defaultSteps: readonly CreationStep[] = ['details', 'files', 'review'];

/** One quiet orientation cue throughout the mobile creation journey. */
export function ProjectCreationProgress({ current, steps = defaultSteps }: { current: CreationStep; steps?: readonly CreationStep[] }) {
  const currentIndex = steps.indexOf(current);
  return <ol className="project-creation-progress" aria-label="Project creation steps">
    {steps.map((step, index) => <li key={step} aria-current={step === current ? 'step' : undefined} data-complete={index < currentIndex || undefined}>
      <span aria-hidden="true">{index < currentIndex ? <CheckIcon size={12} /> : index + 1}</span>{labels[step]}
    </li>)}
  </ol>;
}
