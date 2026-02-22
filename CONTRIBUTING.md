# Contributing to Chilean-law-mcp

Thank you for your interest in contributing!

## How to Contribute

1. Fork the repository
2. Create a feature branch from `dev` (never push directly to `main`)
3. Make your changes
4. Run tests: `npm test && npm run test:contract`
5. Submit a pull request targeting `dev`

## Branch Strategy

```
feature-branch → PR to dev → verify on dev → PR to main → deploy
```

- All changes land on `dev` first
- `main` is production — only receives merges from `dev`
- PRs must pass all CI checks before merge

## Code Standards

- TypeScript strict mode
- All SQL queries must use parameterized statements
- All tools must have Zod schema with `.describe()` annotations
- Run `npm run lint` before committing

## Reporting Issues

- Use GitHub Issues for bug reports and feature requests
- For security vulnerabilities, see [SECURITY.md](SECURITY.md)

## License

By contributing, you agree that your contributions will be licensed under the
Apache 2.0 License.
