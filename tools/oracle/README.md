# Independent export oracle

`workday_export_oracle.py` reads a Workday *View Definition* export with **Python's standard library only** (zipfile + ElementTree) and re-implements the import rules from scratch: `&#xa;` decoding, the "(Workday Owned)" flag, lanes, conditions, completion, notifications and initiating groups. Our TypeScript importer is compared against it, so the importer is checked rather than trusted (DEC-039).

```bash
npm run oracle -- .local/real-change-job.xlsx > /tmp/expected.json
```

Run it on untrusted files in isolated mode (`-I`, already in the npm script) and never commit real exports. Keep them in the git-ignored `.local/` folder.
