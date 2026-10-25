#!/bin/bash
# LifeAgente AI - Release Automation Script
# Usage: ./release.sh <version> (e.g., ./release.sh 2.2.0)

set -e

VERSION=${1:-}

if [ -z "$VERSION" ]; then
    echo "Usage: $0 <version>"
    echo "Example: $0 2.2.0"
    exit 1
fi

# Validate version format (semver)
if ! [[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+(-[a-zA-Z0-9.-]+)?$ ]]; then
    echo "Error: Invalid version format. Use semantic versioning (e.g., 2.2.0, 2.2.0-beta.1)"
    exit 1
fi

echo "🚀 Preparing release v$VERSION..."

# 1. Update VERSION file
echo "$VERSION" > VERSION
echo "✅ Updated VERSION to $VERSION"

# 2. Update CHANGELOG.md
DATE=$(date +%Y-%m-%d)
CHANGELOG_ENTRY="## [$VERSION] - $DATE\n\n### Added\n- Glassmorphism design system with backdrop-filter and CSS fallback\n- COPPA parental consent flow with email verification (Brevo/Resend)\n- Cross-tab cookie consent synchronization (Bug #2 fixed)\n- Mobile viewport fix with interactive-widget=resizes-content (Bug #7 fixed)\n- Accessibility improvements: skip links, live regions, focus trap, reduced motion\n- RLS-secured data deletion endpoint (Bug #3 fixed)\n- SDK Audit component with 18 third-party SDKs documented\n- Consent Manager with 7 consent categories for forms\n- Legal pages: PrivacyPolicy, TermsOfService, RefundPolicy, CookiePolicy\n- Cookie consent banner with granular preferences\n\n### Fixed\n- Bug #2: Cookie consent cross-tab sync via storage event listener\n- Bug #3: DELETE /data/me endpoint filters by JWT user_id\n- Bug #4: Parental consent email verification via Brevo/Resend API\n- Bug #5: Cookie attributes SameSite=Lax; Secure; Partitioned for Safari\n- Bug #6: Firefox backdrop-filter fallback with @supports not (backdrop-filter)\n- Bug #7: Mobile viewport keyboard shift with interactive-widget=resizes-content\n- Bug #8: GitHub token revocation (security)\n\n### Security\n- All RLS policies verified active in Supabase\n- CORS restricted to production domains only\n- Encrypted API key storage with Fernet\n\n### Changed\n- Updated UI components to use glassmorphism design system\n- Centralized glass styles in src/index.css (.glass-panel, .glass-button, .glass-input, .glass-chip)\n- Migrated from @capacitor/storage to @capacitor/preferences\n- Frontend build uses npm install --legacy-peer-deps\n\n### Removed\n- Deprecated @capacitor/storage dependency\n- Legacy non-glass UI variants\n"

# Prepend to CHANGELOG.md (after the first line)
sed -i "1a\\$CHANGELOG_ENTRY" CHANGELOG.md
echo "✅ Updated CHANGELOG.md with v$VERSION entry"

# 3. Commit changes
git add VERSION CHANGELOG.md
git commit -m "chore: v$VERSION"
echo "✅ Committed version bump and changelog"

# 4. Create and push tag
git tag "v$VERSION"
git push upstream main
git push upstream "v$VERSION"
echo "✅ Pushed tag v$VERSION to trigger GitHub Actions release"

echo ""
echo "🎉 Release v$VERSION initiated!"
echo "   GitHub Actions will now build:"
echo "   - .exe (Windows) via Tauri/Electron"
echo "   - .apk (Android) via Capacitor"
echo "   - Source ZIP"
echo ""
echo "   Monitor progress at: https://github.com/brayanortiz906-lab/LifeSync-AI/actions"