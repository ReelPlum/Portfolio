# Visual baselines

Screenshots the visual tests compare against (`tests/visual/pages.spec.js`), one per page, size and colour
scheme. They are made by the "Visual" workflow in the Playwright Docker image, so fonts and rendering
match CI exactly; don't commit screenshots made on your own computer.

- A new page's screenshots are added to the branch automatically the first time the workflow runs.
- After an intended change, run the **Visual** workflow from the Actions tab on your branch with
  **update** ticked. It replaces the screenshots and commits them.
