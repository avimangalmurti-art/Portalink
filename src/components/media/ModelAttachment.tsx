import React, { useEffect, useRef, useState } from 'react';
import { ErrorState, LoadingState } from '../ui/StateViews';
import type { ProjectAttachment } from '../../types/domain';

/**
 * The 3D presentation boundary.
 *
 * GLB/GLTF is the only family the browser can render interactively today, so
 * everything else resolves to `unknown` upstream and never reaches this
 * component. Three.js is loaded on demand, and the canvas is never left blank:
 * loading, ready, and failure are all stated.
 */
export function ModelAttachment({
  attachment, mobileProjectReader = false


}: {attachment: ProjectAttachment;mobileProjectReader?: boolean;}) {
  const mountRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [attempt, setAttempt] = useState(0);
  const source = attachment.sourceUrl;
  useEffect(() => {
    if (!source) {
      return undefined;
    }
    const mount = mountRef.current;
    if (!mount) {
      return undefined;
    }
    let disposed = false;
    let frame = 0;
    let cleanup: (() => void) | null = null;
    setStatus('loading');
    (async () => {
      try {
        const THREE = await import('three');
        const {
          GLTFLoader
        } = await import('three/examples/jsm/loaders/GLTFLoader.js');
        const {
          OrbitControls
        } = await import('three/examples/jsm/controls/OrbitControls.js');
        if (disposed) {
          return;
        }
        const renderer = new THREE.WebGLRenderer({
          antialias: true,
          alpha: true
        });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.setSize(mount.clientWidth, mount.clientHeight);
        mount.appendChild(renderer.domElement);
        renderer.domElement.setAttribute('tabindex', '0');
        renderer.domElement.setAttribute('role', 'img');
        renderer.domElement.setAttribute('aria-label', `Interactive 3D model: ${attachment.displayName}. Drag or use the arrow keys to rotate.`);
        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(45, mount.clientWidth / mount.clientHeight, 0.1, 1000);
        scene.add(new THREE.AmbientLight(0xffffff, 1.1));
        const key = new THREE.DirectionalLight(0xffffff, 1.4);
        key.position.set(3, 5, 4);
        scene.add(key);
        const controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.listenToKeyEvents?.(renderer.domElement);
        const gltf = await new GLTFLoader().loadAsync(source);
        if (disposed) {
          renderer.dispose();
          return;
        }
        const model = gltf.scene;
        // Frame whatever was uploaded, regardless of its authored scale.
        const box = new THREE.Box3().setFromObject(model);
        const size = box.getSize(new THREE.Vector3()).length() || 1;
        const center = box.getCenter(new THREE.Vector3());
        model.position.sub(center);
        scene.add(model);
        camera.position.set(0, size * 0.25, size * 1.1);
        controls.target.set(0, 0, 0);
        controls.update();
        const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        controls.autoRotate = !prefersReducedMotion;
        controls.autoRotateSpeed = 0.8;
        const resize = () => {
          if (!mount.clientWidth || !mount.clientHeight) {
            return;
          }
          camera.aspect = mount.clientWidth / mount.clientHeight;
          camera.updateProjectionMatrix();
          renderer.setSize(mount.clientWidth, mount.clientHeight);
        };
        const observer = new ResizeObserver(resize);
        observer.observe(mount);
        const render = () => {
          controls.update();
          renderer.render(scene, camera);
          frame = requestAnimationFrame(render);
        };
        render();
        setStatus('ready');
        cleanup = () => {
          cancelAnimationFrame(frame);
          observer.disconnect();
          controls.dispose();
          renderer.dispose();
          renderer.domElement.remove();
        };
      } catch {
        if (!disposed) {
          setStatus('error');
        }
      }
    })();
    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      cleanup?.();
    };
  }, [source, attempt, attachment.displayName]);
  if (!source) {
    return <div className="flex h-full items-center justify-center p-8">
        <ErrorState title="This model cannot be shown yet" description={`${attachment.displayName} needs conversion before it can be viewed.`} />
      </div>;
  }
  return <div data-reader-media-state={mobileProjectReader && status === 'loading' ? 'pending' : undefined} className="relative h-full w-full">
      <div ref={mountRef} className="h-full w-full" />
      {status !== 'ready' && <div className="absolute inset-0 flex items-center justify-center bg-[var(--surface-canvas)] p-8">
          {status === 'loading' ? mobileProjectReader
            ? <span role="status" aria-label={`Loading ${attachment.displayName}`} className="flex justify-center"><span className="premium-media-loading-mark" aria-hidden="true" /></span>
            : <LoadingState label={`Loading ${attachment.displayName}`} />
            : <ErrorState title="This model could not be loaded" description={attachment.fileName} onRetry={() => setAttempt((current) => current + 1)} />}
        </div>}
    </div>;
}
