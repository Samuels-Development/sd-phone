import { lazy, Suspense } from 'react';
import type { ComponentProps } from 'react';

const CameraChunk = lazy(() => import('./Camera').then(m => ({ default: m.Camera })));

export function LazyCamera(props: ComponentProps<typeof CameraChunk>) {
    return (
        <Suspense fallback={<div className="absolute inset-0 bg-black" />}>
            <CameraChunk {...props} />
        </Suspense>
    );
}
