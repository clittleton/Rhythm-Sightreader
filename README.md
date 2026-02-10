# Rhythm Sightreader (Percussion)

A static web app for rhythm sightreading practice in percussion class.

## Features
- Random rhythm generation in standard notation (VexFlow)
- Spacebar-based student performance capture
- Millisecond early/late grading per note
- Fixed 4-loop challenge mode with average scoring
- Five progressive difficulty levels with mixed time signatures
- Visual timing timeline and per-note feedback table

## Files
- `index.html`
- `styles.css`
- `src/main.js`
- `src/config/levels.js`
- `src/core/rhythmGenerator.js`
- `src/core/timingEngine.js`
- `src/core/grader.js`
- `src/audio/metronome.js`
- `src/ui/notationView.js`
- `src/ui/feedbackView.js`
- `tests/core.test.js`

## Run Locally
1. Open directly:
   - `open index.html`
2. Or use VS Code Live Server for easier refresh.

## Run Core Validation Tests
From project root:

```bash
node --experimental-default-type=module tests/core.test.js
```

This checks:
- 1000 random generations per level with exact measure sums
- Allowed rhythm vocabulary by level
- Grading behavior for offsets and missing/extra taps
- 4-loop averaging logic

## Upload to GitHub + Enable GitHub Pages
1. Create a new GitHub repository.
2. In this folder:

```bash
git init
git add .
git commit -m "Initial rhythm sightreader app"
git branch -M main
git remote add origin <YOUR_REPO_URL>
git push -u origin main
```

3. On GitHub, open **Settings > Pages**.
4. Under **Build and deployment**:
   - Source: **Deploy from a branch**
   - Branch: **main**
   - Folder: **/(root)**
5. Save and wait for deployment.
6. Your app will be available at:
   - `https://<your-username>.github.io/<repo-name>/`

## Classroom Tips
- Start with Level 1 and single attempts.
- Use Loop x4 for endurance and consistency checks.
- Use the timeline strip and ms offsets to discuss timing control.
