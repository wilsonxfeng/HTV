# ReMotion demo recording plan

Progress is the shared history screen; open Movement Echoes from it to use Ask ReMotion and focus or overlay recordings. There is no separate clinician dashboard.

## Record beforehand

| Set | Record | What it demonstrates |
| --- | --- | --- |
| Finger spread | One reference video, then three complete practice sessions of the same hand and consenting volunteer | Greatest recorded opening, first versus latest, and three overlapping hand silhouettes |
| Seated knee extension | Two complete sessions of the same volunteer and selected side, filmed from the side | Smallest recorded knee range and two overlapping person silhouettes |
| Optional elbow demo | Two unweighted bicep-curl sessions of the same volunteer and side | Exercise-specific history, elbow range and body overlays |

Use comfortable, permitted movement. The volunteer can demonstrate distinct comfortable ranges in different takes; label them demonstration takes, not recovery over time. Keep actual capture times. Do not stage impairment or change timestamps to suggest a treatment outcome.

Keep the camera fixed on a stand, with the same framing, distance, lighting and orientation for every clip in a set. Use a plain, contrasting background and avoid motion blur. For hands, keep the complete palm, wrist and fingertips visible and facing the lens. For knee footage, keep the hip, knee and ankle visible from the side. For elbows, keep the shoulder, elbow, wrist and hip visible with the arm clear of the torso. Include the starting position and the full return, and perform three complete cycles per session.

For finger first/latest comparisons, reuse the **identical reference video file** each time. After the coach captures the neutral pose, say **reference video**, select that file, and follow the lesson. This gives recordings the same extracted neutral/target reference. A new personal calibration creates a different comparison group; the search deliberately does not combine those groups. Use the same exercise, side, camera orientation, analysis settings and demonstration account throughout a set. Verify that the intended reference supports the permitted comfortable range before presenting.

## Make recordings searchable

1. Run the API and app, and connect the participant's scoped patient token in **Progress → Connect synced history** (or **Practice → Save to Progress**). The same tab keeps that connection for recording and review.
2. Before each practice, open **Save to Progress** and explicitly consent to silent video and movement-data capture. Finish the lesson, and wait for **Saved to synced history** or check that its recording is complete in Progress. Landmark-only local sessions do not acquire a video automatically.
3. In Progress, choose **Synced recordings**, the exercise and correct side, then open a recording or select recordings to compare. Ask ReMotion appears inside Movement Echoes. Refresh if needed; uploads completing while Progress is open refresh the history automatically.
4. Rehearse **Which session had the greatest recorded finger opening?** and **Compare first and latest** inside Echoes. Confirm that the matching original video becomes focused and pauses at its peak, and that the comparison overlay works. Search excludes tracking below 80%, and finger peaks also need at least 80% repetition coverage. Repeat a poorly tracked take rather than changing its values.
5. Rehearse the knee search separately. Knee range is a session aggregate; Ask ReMotion opens its video at the start and states that an exact event timestamp is unavailable.

The supplied **Demo videos** buttons in Progress open the existing local hand and knee footage directly. These clips support both local scripted searches and overlays; loading them does **not** put them into the authenticated cloud search database. The supplied low-ROM hand clip is a static hold, which is excluded from detected finger-movement peaks. The supplied hand clips also have unconfirmed physical hand identity, so do not present them as the participant's right-hand history. Record through the connected Practice flow for the searchable demo set.

The history connection’s **Use local demo** button grants read access to sample history; use an assigned patient token for a live upload. The exact greatest-finger-opening question has a fixed friendly reply and deterministic selection, without Gemini. Local Echoes can search their loaded demo clips directly. Other typed questions about synced history use the configured Gemini interpreter. Numeric measurements stay internal.

## Presentation order

1. Start a live Finger Spread & Close session with the voice coach and video consent enabled. Complete it: the session saves immediately and grows one flower. The flower celebrates completion, not range or a higher score. Extra repetitions within a session earn no additional flowers.
2. Show the new flower in Garden, then open Progress.
3. Open the finger recordings in Movement Echoes and ask **Which session had the greatest recorded finger opening?** Show the fixed reply and the matching video automatically focused and paused at its stored peak, then play it.
4. Click **Compare first and latest**, then turn on **Overlay Sessions**. Ask ReMotion and the loaded recordings remain available inside Echoes.
5. Return to Progress and open the knee recordings. Click **Find smallest knee movement** in Echoes, then show their overlays. If the cloud connection fails, use the explicit Demo videos buttons for local overlays and identify them as demo footage.

The live take joins a first/latest comparison only if it uses the same participant, side and exact reference/configuration as the prerecorded set. Reuse the prerecorded reference file during the live session if that comparison is part of the presentation.
