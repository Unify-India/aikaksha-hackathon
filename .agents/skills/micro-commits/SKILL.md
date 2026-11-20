---
name: micro-commits
description: >-
  Enforces making frequent, atomic, small, and self-contained git commits (micro-commits)
  as work progresses. Use whenever modifying code, refactoring, fixing bugs, or implementing
  features incrementally, rather than leaving all changes in a single large commit.
---

# Micro-Commits Skill

A guide and runbook for working with **micro-commits**—capturing progress in tiny, verifiable, and logically isolated steps rather than waiting for large batches of work to finish.

---

## Core Philosophy

- **Atomic changes**: Each commit should do exactly one logical thing (e.g., add one interface, implement one helper function, fix one test, update one configuration).
- **Always green**: Every commit must leave the codebase in a compilable, passing state. Never commit broken code or syntax errors.
- **Bisect-friendly**: Micro-commits make `git bisect` effortless when troubleshooting regressions.
- **Easy rollbacks**: If an experiment or design pivot fails, reverting an isolated micro-commit is safe and trivial.
- **Clear narrative**: Commit messages should clearly describe the *intent* using Conventional Commits.

---

## When to Make a Micro-Commit

Commit immediately upon reaching any of these micro-milestones:

1. **Before refactoring**: Snapshot the working state with passing tests.
2. **Type/Interface definition**: Once contracts/interfaces/models are created or updated.
3. **Single unit/feature slice**: One function or class method implemented.
4. **Test addition**: When a reproduction test or unit test is written.
5. **Bug fix verification**: As soon as the test passes or the error is resolved.
6. **Documentation / Config change**: Updating configs, documentation, or typings.

---

## Standard Workflow

### 1. Stage only relevant changes
Avoid blind `git add .` if unrelated edits or scratch files exist. Stage exact files or hunks:
```bash
git add path/to/specific/file.ts
# Or interactive patch staging
git add -p path/to/specific/file.ts
```

### 2. Verify pre-commit state
Ensure no stray syntax errors or broken builds:
```bash
# Verify status and diff before committing
git status -s
git diff --cached
```

### 3. Write Conventional Commit messages
Follow the format: `<type>(<scope>): <subject>`

- `feat`: A new feature or capability
- `fix`: A bug fix
- `refactor`: Code change that neither fixes a bug nor adds a feature
- `test`: Adding missing tests or correcting existing tests
- `docs`: Documentation only changes
- `chore`: Maintenance, dependency updates, or tooling configuration
- `style`: Changes that do not affect the meaning of the code (formatting, white-space)

#### Examples:
- `feat(exam): add IExamOMRConfig interface with opt-out presets`
- `refactor(question): extract option letter normalization to AI_TO_APP_OPTION_MAP`
- `test(grading): add test case for 1/4 negative mark calculation`
- `fix(auth): prevent student late submission when endTimestampMs is exceeded`

---

## Rules & Guardrails

- **Do NOT bundle formatting changes with logic changes**: Keep style/lint cleanup in its own micro-commit.
- **Do NOT commit temporary scratch scripts or `.env` secrets**: Check `git status` before committing.
- **Keep commit messages imperative & concise**: "add validator" not "added validator" or "adds validator".
- **Never push broken intermediate states to protected shared branches**: Keep micro-commits local or on feature branches; rebase/squash only if project conventions explicitly mandate it.
