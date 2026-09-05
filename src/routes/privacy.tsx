import { createFileRoute } from "@tanstack/react-router";

import { PublicPage, PublicSection } from "@/components/brand/PublicPage";

const updated = "September 5, 2026";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy Policy — LandDraft" },
      {
        name: "description",
        content: "How LandDraft handles account, project, map and device information.",
      },
    ],
  }),
  component: Privacy,
});

function Privacy() {
  return (
    <PublicPage
      eyebrow={`Privacy policy · Updated ${updated}`}
      title="Your maps are your work"
      intro="This policy explains what LandDraft handles when you create an account, build a map or connect geographic data."
    >
      <PublicSection title="Information LandDraft handles">
        <ul>
          <li>
            <strong>Account information:</strong> your name, email address, authentication provider
            identifiers and account status.
          </li>
          <li>
            <strong>Project information:</strong> project names, map settings, layers, feature
            attributes, drawings, print layouts, uploaded files, saved versions and sharing choices.
          </li>
          <li>
            <strong>Sharing information:</strong> recipient email addresses, assigned access roles,
            scoped shared-map snapshots, editor working copies and review status.
          </li>
          <li>
            <strong>Device and service information:</strong> session data, preferences, error
            details, browser and network information, and service logs needed to secure and operate
            the app.
          </li>
        </ul>
      </PublicSection>
      <PublicSection title="How the information is used">
        <p>
          LandDraft uses this information to authenticate users, open and synchronize projects,
          preserve save history, render and export maps, diagnose failures, protect accounts and
          improve core product reliability. LandDraft does not sell personal information or use map
          projects for targeted advertising.
        </p>
      </PublicSection>
      <PublicSection title="Where information is stored and processed">
        <p>
          Signed-in account and project data is stored in LandDraft&apos;s Supabase cloud workspace.
          The browser also keeps limited session, preference and working-state information on the
          device. Hosting and authentication are supported by service providers including Supabase,
          Lovable, Google and Apple when those sign-in methods are used.
        </p>
        <p>
          Basemaps, geocoding, public datasets and layers connected from other sites are requested
          from their respective publishers. Those providers may receive ordinary request data such
          as an IP address, browser details, map extent or search text under their own policies.
        </p>
      </PublicSection>
      <PublicSection title="Files, public data and assistant requests">
        <p>
          Files you import remain part of your project unless you remove them. Public records remain
          subject to the publishing agency&apos;s terms and update schedule. When you use LandDraft
          AI, your request, limited recent assistant history, and a size-limited summary of the
          active project&apos;s layers, fields, sample values, and selection are securely sent
          through LandDraft&apos;s server to the configured AI inference provider for an answer or
          supported map action. The free beta provider is Groq; a different provider may be selected
          by LandDraft in the future without exposing its credentials to the browser. Live place
          searches may also send the requested place/category and area to OpenStreetMap services.
          Assistant requests are saved with the project so recent changes can be reviewed or
          reverted. Do not submit secrets or highly sensitive personal information to the assistant.
        </p>
      </PublicSection>
      <PublicSection title="Shared maps">
        <p>
          A map administrator chooses the layers and features included in each private shared map.
          Signed-in recipients can access only active shares granted to their account or email.
          Editors work in a separate project copy unless they are granted administrator access.
          Administrators can change roles or remove access at any time.
        </p>
      </PublicSection>
      <PublicSection title="Retention and your choices">
        <p>
          You can delete individual projects and saved map content from LandDraft. Some records may
          remain temporarily in backups, security logs or where retention is required by law. To
          request access, correction or deletion of account-level information, contact the LandDraft
          support address shown on the sign-in consent screen.
        </p>
      </PublicSection>
      <PublicSection title="Security and children">
        <p>
          LandDraft uses access controls and encrypted network connections, but no online service
          can promise absolute security. The service is not directed to children under 13. A parent,
          guardian or school should supervise use by a child and should not upload sensitive
          personal information about minors.
        </p>
      </PublicSection>
      <PublicSection title="Policy changes and contact">
        <p>
          Material changes will be reflected on this page with a revised date. Privacy questions may
          be sent to the LandDraft user-support email displayed by the sign-in provider.
        </p>
      </PublicSection>
    </PublicPage>
  );
}
