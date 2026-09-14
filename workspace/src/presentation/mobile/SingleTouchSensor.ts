import { TouchSensor, type SensorProps, type TouchSensorOptions } from '@dnd-kit/core';

/** A second finger belongs to content zoom, never to a pending or active drag. */
export class SingleTouchSensor extends TouchSensor {
  constructor(props: SensorProps<TouchSensorOptions>) {
    const document = (props.event.target as Node).ownerDocument;
    const additionalTouch = (event: TouchEvent) => {
      if (event.touches.length > 1) cancel();
    };
    const cancelledTouch = () => cancel();
    const cleanup = () => {
      document?.removeEventListener('touchstart', additionalTouch, true);
      document?.removeEventListener('touchcancel', cancelledTouch, true);
    };
    super({
      ...props,
      onCancel: () => { cleanup(); props.onCancel(); },
      onEnd: () => { cleanup(); props.onEnd(); },
    });
    // dnd-kit exposes no public way to abort a pending hold. Keep this adapter
    // isolated; the installed-sensor regression checks its cancellation and
    // listener cleanup, including the delayed activation timer.
    const cancel = () => (this as unknown as { handleCancel(): void }).handleCancel();
    document?.addEventListener('touchstart', additionalTouch, true);
    document?.addEventListener('touchcancel', cancelledTouch, true);
  }
}
