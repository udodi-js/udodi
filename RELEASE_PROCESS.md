# Release Process (Maintainers Only)

This section describes how maintainers release new versions using semantic versioning (MAJOR.MINOR.PATCH), e.g. `1.0.0`.

## Version Bumping Rules

- **MAJOR (x.0.0)**: Breaking changes
- **MINOR (0.x.0)**: Backward-compatible features
- **PATCH (0.0.x)**: Backward-compatible bug fixes

## Git Release Workflow

### 1. Ensure working tree is clean
```bash
git status
```

### 2. Update version tag

#### Patch release (1.0.0 → 1.0.1)
```bash
git commit -am "chore: prepare patch release"
git tag v1.0.1
```

#### Minor release (1.0.0 → 1.1.0)
```bash
git commit -am "chore: prepare minor release"
git tag v1.1.0
```

#### Major release (1.0.0 → 2.0.0)
```bash
git commit -am "chore: prepare major release"
git tag v2.0.0
```

### 3. Push commits and tags
```bash
git push origin main
git push origin --tags
```

## Notes

- Always ensure CI passes before tagging a release.
- Tags should be immutable once pushed.
- Prefer annotated tags for production releases:
```bash
git tag -a v1.0.0 -m "Release version 1.0.0"
```
