import React, { ReactNode } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
type ScrollRevealProps = {
  children: ReactNode;
  className?: string;
  amount?: number;
};
export function ScrollReveal({
  children,
  className,
  amount = 0.08
}: ScrollRevealProps) {
  const shouldReduceMotion = useReducedMotion();
  return <motion.div className={className} initial={shouldReduceMotion ? {
    opacity: 0
  } : {
    opacity: 0,
    y: 20
  }} whileInView={shouldReduceMotion ? {
    opacity: 1
  } : {
    opacity: 1,
    y: 0
  }} viewport={{
    once: true,
    amount
  }} transition={shouldReduceMotion ? {
    duration: 0.18,
    ease: 'easeOut'
  } : {
    duration: 0.5,
    ease: [0.22, 1, 0.36, 1]
  }}>
      {children}
    </motion.div>;
}