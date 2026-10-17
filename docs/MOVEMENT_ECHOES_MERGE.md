# Movement Echoes merge handoff

- Branch: `feature/movement-echoes`
- Exact base: `861d13fcdab980c7a582cf58feffc4937a8f7e49` (`clean UI up`)
- The base's voice-led practice, garden, 3D Studio and existing session storage were preserved. No main-branch merge is performed by this task.
- Resolve implementation commits with `git log --oneline 861d13f..feature/movement-echoes`.

## Additive files

All feature UI, scoped styles, segmentation, timing, alignment, rendering, cache repository, adapters, tests and the independent harness are under `src/features/movement-echoes/`.

The four user-supplied original MOV files in `public/demo recordings/` are included unchanged. `public/demo recordings/prepared/` adds a versioned provenance manifest and 97 actual video-derived transparent WebP images. Documentation and visual/runtime evidence are under `docs/`. `vite.echoes.config.ts` adds the separate production harness build.

## Existing files changed

1. `src/components/Progress.tsx`: lazy Movement Echoes entry and local open/close state. No main router changes.
2. `src/App.tsx`: one privacy-copy correction describing optional local video storage. No routing or behavioral changes.
3. `package.json` and lockfile: `dev:echoes`, `build:echoes`; development-only `fake-indexeddb` 6.2.6.
4. `.gitignore`: `dist-echoes/`.
5. `README.md`: privacy clarification and feature links.

No runtime dependency was added. Existing ElevenLabs, Recovery Garden, geometry, tracker, legacy database and Studio implementation files remain unchanged.

## Integration

The Progress entry is already wired. To mount elsewhere, import `{ MovementEchoes }` from `src/features/movement-echoes` and pass `onClose`. Optional initial `sessions` must contain real video Blobs and the feature's timestamped observation metadata. `adaptMotionSession` accepts an actual matching original video plus dimensions, duration, encoded mirror flag and measured timestamp offset. Old landmark-only sessions stay in the 3D Studio; no fake webcam source is generated for them.

The feature has a separate database and deletion controls. Only supply `onDeleted` if an imported feature record was explicitly linked to a matching legacy history ID. Garden progression is unaffected. To integrate a future recorder, either analyze its encoded Blob with `importRecording`, or supply synchronized source-video coordinates and a measured offset through the adapter.

## Run and validate

```sh
npm install
npm test
npm run build
npm run build:echoes
npm run dev
npm run dev:echoes
```

The app uses port 5173. The harness uses port 5174 at `/src/features/movement-echoes/demo/index.html`. To preview its production output, serve `dist-echoes/` and open that nested HTML path. The prepared demo files are portable with the repository; changing a source video or preprocessing version invalidates their use and triggers local analysis.

Read [MOVEMENT_ECHOES.md](MOVEMENT_ECHOES.md) for algorithms/API and executed evidence, and [MOVEMENT_ECHOES_CAPTURE_GUIDE.md](MOVEMENT_ECHOES_CAPTURE_GUIDE.md) for new recordings.

## Limitations and remaining manual checks

`low ROM` has a real static pose instead of an invented complete cycle. The moving clips each contain one detected cycle. Demo file names and displayed measured degrees can disagree; names are not used as evidence of improvement. The demo's unknown physical side is restricted to its explicitly reviewed same-hand demonstration group. Personal recordings require hand/orientation metadata.

No physical iPhone/Safari check, new live person's webcam exercise, broad segmentation robustness benchmark, clinical validation or remote patient access is claimed. Background/color segmentation can fail under occlusion or moving/complex backgrounds; warnings and the real-video fallback remain available. No audio/account configuration changes were made to ElevenLabs.
