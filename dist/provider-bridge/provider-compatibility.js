// ──────────────────────────────────────────────────────────────────────────────
// BUILD-069 — Provider Compatibility Registry
// ──────────────────────────────────────────────────────────────────────────────
export function compareVersions(v1, v2) {
    const parse = (v) => {
        // Strip any leading non-numeric prefix like 'v'
        const clean = v.replace(/^v/, "");
        const parts = clean.split("-")[0].split(".");
        return parts.map(x => parseInt(x, 10) || 0);
    };
    const p1 = parse(v1);
    const p2 = parse(v2);
    for (let i = 0; i < Math.max(p1.length, p2.length); i++) {
        const n1 = p1[i] ?? 0;
        const n2 = p2[i] ?? 0;
        if (n1 > n2)
            return 1;
        if (n1 < n2)
            return -1;
    }
    return 0;
}
export class ProviderCompatibilityRegistry {
    static validateCompatibility(compatibility, installedVersion) {
        const compMin = compareVersions(installedVersion, compatibility.minimumVersion);
        if (compMin < 0) {
            return {
                supported: false,
                isNewer: false,
                error: `Installed version ${installedVersion} is below the minimum supported version ${compatibility.minimumVersion}.`
            };
        }
        const compMax = compareVersions(installedVersion, compatibility.maximumTestedVersion);
        if (compMax > 0) {
            return {
                supported: true,
                isNewer: true,
                warning: `Installed version ${installedVersion} is newer than the latest tested version ${compatibility.maximumTestedVersion}. Stability warnings may apply.`
            };
        }
        return { supported: true, isNewer: false };
    }
    static getRecommendation(compatibility, installedVersion) {
        const compMin = compareVersions(installedVersion, compatibility.minimumVersion);
        if (compMin < 0) {
            return `Upgrade "${compatibility.providerId}" to at least version ${compatibility.minimumVersion} or newer.`;
        }
        const compMax = compareVersions(installedVersion, compatibility.maximumTestedVersion);
        if (compMax > 0) {
            return `Consider using/downgrading "${compatibility.providerId}" to the tested range (${compatibility.minimumVersion} to ${compatibility.maximumTestedVersion}).`;
        }
        return `Provider is compatible. No action recommended.`;
    }
}
