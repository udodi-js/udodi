# Contributing to Udodi.js

Udodi.js follows a structured Git workflow designed to ensure stability, scalability, and predictable releases.

## Branch roles

We use the following branching model:

### `main`
- Production-ready code
- Always stable
- Protected branch (no direct pushes allowed)
- Releases are created from this branch via tags

### `develop`
- Integration branch for ongoing work
- All completed features are merged here first
- Used for testing and stabilization

### `feature/*`
- Used for new features or fixes
- Must always branch from `develop`
- Must be merged back into `develop`

```
feature/* → develop → main → tag → npm publish
```

---

## Golden Rules

- Never push directly to `main`
- Always branch from `develop`
- All PRs must target `develop`
- Releases are created only from `main` via tags
- CI must pass before merging

---

## Quick Start (Recommended Workflow)

Instead of manually running multiple commands, use this standardized flow.

### 1. Start a new feature

```bash
git checkout develop
git pull origin develop
git checkout -b feature/my-feature
```

---

### 2. Code Quality Rules

Before submitting a PR:

#### Run tests:
```bash
npm test
```

#### Build project:
```bash
npm run build
```
#### Ensure no lint or runtime errors exist

---

### 3. Work and commit

```bash
git add .
git commit -m "feat: describe your change"
git push origin feature/my-feature
```

---

### 4. Create Pull Request

Open PR:

```
feature/my-feature → develop
```

---

### 5. Sync latest changes

```bash
git checkout develop
git pull origin develop
```

---

### 6. Release (maintainers only)

```bash
git checkout main
git pull origin main
npm version minor
git push origin main --tags
```

This triggers automated npm publish via GitHub Actions.

See [RELEASE_PROCESS.md](./RELEASE_PROCESS.md) for detailed information on how to publishing release.

---

## One-Line Helper (Developer Shortcut)

You can add this alias to simplify workflow:

### Add Git alias

```bash
git config --global alias.udodi-start '!f() { git checkout develop && git pull origin develop && git checkout -b feature/$1; }; f'
```

### Usage

```bash
git udodi-start my-feature
```

This automatically:
- switches to develop
- pulls latest changes
- creates feature branch

---

## Commit Convention

```
feat: add new feature
fix: resolve bug
refactor: improve structure
docs: update documentation
test: add tests
```

---

## Pull Request Rules

- Must target `develop`
- Must pass CI
- Must be small and focused
- Must include description

---

## CI Enforcement

All PRs must pass:
- Tests
- Build
- Validation checks

---

## Release Flow

Only maintainers can release:

```bash
npm version patch|minor|major
git push origin main --tags
```

---

## Summary

```text
feature/* → develop → main → npm publish
```

This workflow ensures:
- Stability
- Clean history
- Safe releases
- Predictable CI/CD pipeline
