import React, { useEffect, useState } from 'react';

const GESTURES = ['mitten', 'open-palm', 'thumbs-up', 'ok', 'peace'] as const;
type Gesture = (typeof GESTURES)[number];

const GESTURE_DURATION_MS = 360;

/**
 * Portalink's full-screen startup mark.
 *
 * The fixed character is deliberately rendered as one persistent SVG layer.
 * Only the raised-arm group is replaced as the gesture changes, so the head,
 * globe grid, torso, resting arm, viewBox, and character centre cannot jump.
 */
export function PortalinkSplashLoader() {
  const [gestureIndex, setGestureIndex] = useState(0);
  const gesture = GESTURES[gestureIndex];

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setGestureIndex((current) => (current + 1) % GESTURES.length);
    }, GESTURE_DURATION_MS);

    return () => window.clearInterval(intervalId);
  }, []);

  return (
    <div
      data-portalink-splash="true"
      data-active-gesture={gesture}
      role="status"
      aria-live="polite"
      aria-label="Portalink is loading"
      className="fixed inset-0 z-[1000] grid min-h-[100dvh] w-full place-items-center overflow-hidden bg-white"
      style={{ backgroundColor: '#ffffff', color: '#000000' }}
    >
      <svg
        aria-hidden="true"
        focusable="false"
        viewBox="0 0 420 600"
        className="h-auto max-h-[78dvh] w-[clamp(220px,42vmin,320px)] max-w-[82vw]"
        style={{ color: '#000000' }}
      >
        <defs>
          <clipPath id="portalink-loader-head-clip">
            <circle cx="164" cy="148" r="96" />
          </clipPath>
          <clipPath id="portalink-loader-torso-clip">
            <path d="M124 232 C95 244 78 287 75 344 C70 434 96 517 164 526 C232 517 258 434 253 344 C250 287 233 244 204 232 C185 243 143 243 124 232 Z" />
          </clipPath>
        </defs>

        <g
          data-raised-arm-layer="true"
          data-gesture={gesture}
          fill="none"
          stroke="#000000"
          strokeWidth="6"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <GestureLayer gesture={gesture} />
        </g>

        <g
          data-fixed-character-layer="true"
          fill="none"
          stroke="#000000"
          strokeWidth="6"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {/* The resting left arm is fixed and sits behind the torso. */}
          <path d="M117 239 C85 250 66 301 62 362 L58 420 C56 447 66 464 82 464 C96 464 103 449 98 431 C105 420 103 407 97 399 L102 353 C106 307 114 274 129 252" />
          <path d="M62 368 C74 373 86 374 99 370" />
          {/* Immutable torso and its clipped longitude/latitude grid. */}
          <g clipPath="url(#portalink-loader-torso-clip)">
            <path d="M164 228 L164 529" />
            <path d="M127 230 C105 300 106 457 139 523" />
            <path d="M201 230 C223 300 222 457 189 523" />
            <path d="M82 278 C118 305 208 305 246 278" />
            <path d="M75 346 C116 375 212 375 253 346" />
            <path d="M82 416 C122 447 206 447 246 416" />
            <path d="M102 486 C135 502 193 502 226 486" />
          </g>
          <path d="M124 232 C95 244 78 287 75 344 C70 434 96 517 164 526 C232 517 258 434 253 344 C250 287 233 244 204 232 C185 243 143 243 124 232 Z" />

          {/* Immutable globe head and its clipped grid. */}
          <g clipPath="url(#portalink-loader-head-clip)">
            <path d="M164 50 L164 246" />
            <path d="M145 52 C109 91 107 203 145 244" />
            <path d="M183 52 C219 91 221 203 183 244" />
            <path d="M78 108 C121 88 207 88 250 108" />
            <path d="M68 148 C113 158 215 158 260 148" />
            <path d="M79 193 C123 213 205 213 249 193" />
          </g>
          <circle cx="164" cy="148" r="96" />
        </g>
      </svg>
    </div>
  );
}

function GestureLayer({ gesture }: { gesture: Gesture }) {
  switch (gesture) {
    case 'mitten':
      return (
        <>
          <path d="M214 247 C245 250 273 230 290 199" />
          <path d="M232 285 C271 275 303 247 319 213" />
          <path d="M290 199 C284 181 280 160 287 151 C293 143 302 149 310 166 L315 177 C319 153 328 126 344 116 C358 107 373 114 378 128 C385 150 372 177 358 199 L345 222 C325 220 305 211 290 199 Z" />
          <path d="M319 213 C327 218 336 221 345 222" />
        </>
      );
    case 'open-palm':
      return (
        <>
          <path d="M214 247 C245 250 273 229 291 197" />
          <path d="M232 285 C271 275 302 248 318 220" />
          <path d="M291 197 C284 178 282 158 288 149 C294 141 303 149 311 165 L316 178 L315 123 C315 109 320 99 328 99 C337 99 339 109 336 123 L329 159 L340 118 C343 105 351 99 358 103 C366 107 363 119 359 131 L348 163 L357 137 C361 125 368 122 374 127 C380 132 376 144 371 155 L359 177 L366 160 C371 149 378 149 382 155 C386 161 379 172 374 181 L359 207 C350 224 333 230 317 221 C305 215 298 206 291 197 Z" />
          <path d="M318 220 C328 226 343 226 359 207" />
        </>
      );
    case 'thumbs-up':
      return (
        <>
          <path d="M214 247 C247 250 276 228 294 198" />
          <path d="M232 285 C269 276 300 250 317 221" />
          <path d="M294 198 C301 181 307 165 310 146 L311 121 C311 107 320 100 329 104 C338 108 340 119 338 132 L336 155 C347 150 359 152 363 160 C367 168 362 176 354 179 C364 179 370 186 369 194 C368 202 361 207 352 207 C360 209 364 215 362 222 C360 230 351 233 341 231 C347 235 348 242 344 248 C339 256 327 254 318 248 C307 240 301 228 298 216 Z" />
          <path d="M336 155 C331 174 319 189 309 199" />
          <path d="M354 179 C344 181 336 181 329 180" />
          <path d="M352 207 C342 207 334 205 327 202" />
          <path d="M341 231 C333 229 327 225 322 221" />
          <path d="M317 221 C324 228 334 232 344 233" />
        </>
      );
    case 'ok':
      return (
        <>
          <path d="M214 247 C244 249 269 236 286 213" />
          <path d="M232 285 C269 281 295 263 307 239" />
          <path d="M286 213 C280 199 282 185 291 178 C299 171 309 174 318 186 C315 163 317 135 325 126 C332 118 342 122 343 133 L341 163 C345 140 352 129 361 131 C370 133 371 143 367 156 L359 178 C366 160 375 154 382 159 C390 165 385 177 379 188 L370 205 C378 195 387 194 392 201 C398 209 389 221 382 229 C366 248 348 256 329 250 C313 245 302 235 297 224 Z" />
          <circle cx="310" cy="202" r="14" />
          <path d="M307 239 C319 249 342 256 359 246" />
        </>
      );
    case 'peace':
      return (
        <>
          <path d="M214 247 C245 250 272 231 289 203" />
          <path d="M232 285 C270 278 299 254 314 229" />
          <path d="M289 203 C284 187 285 174 292 168 C299 163 307 169 314 181 L319 190 L317 126 C316 113 323 106 331 107 C340 109 342 118 340 131 L337 166 L353 121 C357 109 366 106 373 111 C381 117 376 129 372 139 L355 179 C363 170 372 168 379 174 C386 180 383 191 377 201 C371 215 362 226 349 234 C333 244 314 234 304 221 Z" />
          <path d="M314 181 C321 193 328 200 337 204" />
          <path d="M355 179 C347 192 344 202 345 211" />
          <path d="M314 229 C325 239 338 241 349 234" />
        </>
      );
  }
}
