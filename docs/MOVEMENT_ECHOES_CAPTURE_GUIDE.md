# Preparing real Movement Echoes recordings

Use one consenting team member and one physical hand for a demonstration. Recordings do not represent stroke recovery or multiple weeks unless that is actually their provenance.

1. Open Progress → Movement Echoes → Add a recording.
2. Set the physical hand and whether the **saved pixels** are mirrored. The feature does not silently flip opposite hands. Keep these settings consistent across comparison clips.
3. Check the local-video consent box. Import an existing video, or start a new camera recording. New captures request video only, without microphone audio. Imported sources remain unchanged and muted.
4. Fix the camera in place. Prefer a plain matte contrasting background, even lighting, no face immediately behind the fingertips, no sleeve over the palm, and a full visible hand. Skin color is learned from the actual hand, rather than a fixed assumed skin-tone threshold.
5. Begin with fingers together, slowly spread within the comfortable/prescribed range, hold briefly and return together. Follow the person's configured routine; do not add repetitions to earn rewards. A complete cycle needs a clearly observed opening and closing. Recording stops after at most 90 seconds.
6. Finish the recording. The feature analyzes the encoded video locally, selects a cycle with good tracking, then prepares real hand images. Wait for its actual preparation progress to finish.
7. Open Inspect extraction quality. Look for all five visible fingertips, true widths, open finger gaps and a clean wrist cut. Background/face patches, missing fingers, severe holes or clipping make an outline unsuitable. Adjust color tolerance or recapture against a better backdrop. Heuristic “passed” status is not a guarantee; inspect the imagery.
8. If no distinct cycle was detected, a labeled static pose may be available. For an actual full cycle that needs manual help, open Original video and manual phase markers, inspect the footage and mark start, peak, end in that order. Manual markers stay labeled. Do not invent phases for an unchanged held pose.
9. Import/capture another compatible clip. Use Overlay Week, pause at peak, check palm registration, scrub and tap a visible ghost. Incompatible hand/exercise/mirror metadata is excluded. Choose original videos side by side when contours cannot be extracted faithfully.
10. Reload to verify local persistence before demonstrating. A different browser/device has different personal storage. Deleting a local recording also deletes its ghost caches. Browser-data clearing removes personal imports. The four bundled demo files and reviewed cutouts can be loaded again from the repository.

For the supplied clips, three show detected open–close cycles; `low ROM` is an explicitly static comparison. Their filenames are labels supplied by the team, not computed rankings. Measurements are estimated 3D adjacent finger-axis angles, not clinical joint ROM or neurological recovery.

The developer harness shares the same importer, viewer and repository. Prepared bundled fixtures consist of original MOV files plus the source-hash/algorithm-version manifest and transparent images in `public/demo recordings/prepared/`; moving that folder with the repository makes the reviewed demonstration portable. Never label synthetic geometry/canvas test fixtures as real camera footage.
