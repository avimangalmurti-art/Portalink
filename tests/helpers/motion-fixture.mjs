import {readFileSync} from 'node:fs';
const css=readFileSync(new URL('../../src/presentation/motion/motion.css',import.meta.url),'utf8');
const ms=scale=>Number(css.match(new RegExp('--m-'+scale+':(\\d+)ms'))[1]);
/** Feature harnesses run handlers synchronously; motion itself has separate runtime/browser tests. */
export const motionFixture={motionMs:ms,motionSeconds:scale=>ms(scale)/1000,motionEase:()=> 'cubic-bezier(.2,.8,.2,1)',motionCurve:()=>[.2,.8,.2,1],motionUpdate:fn=>fn()};
export const sheetMotionFixture={useSheetMotion:onClose=>({closing:false,close:after=>after?after():onClose()})};
