import { createFileRoute } from "@tanstack/react-router";

import { PublicPage, PublicSection } from "@/components/brand/PublicPage";

const updated = "August 26, 2026";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: "Terms of Service — LandDraft" },
      {
        name: "description",
        content: "The terms that apply when using LandDraft mapping and GIS services.",
      },
    ],
  }),
  component: Terms,
});

function Terms() {
  return (
    <PublicPage
      eyebrow={`Terms of service · Updated ${updated}`}
      title="Use LandDraft responsibly"
      intro="These terms apply when you access LandDraft, create an account, save a project or use its mapping and data tools."
    >
      <PublicSection title="Using the service">
        <p>
          You may use LandDraft for lawful mapping, planning, research and collaboration. You are
          responsible for your account, the accuracy of information you enter, and activity
          performed through your credentials. Do not misuse the service, interfere with its
          operation, bypass access controls or use it to violate another person&apos;s rights.
        </p>
      </PublicSection>
      <PublicSection title="Your content">
        <p>
          You retain ownership of files, drawings, attributes and other content you add. You grant
          LandDraft the limited permission needed to store, process, render, back up and export that
          content for you. You must have the right to upload and share the content you place in a
          project, especially personal, confidential, licensed or regulated information.
        </p>
      </PublicSection>
      <PublicSection title="Sharing and collaboration">
        <p>
          Project administrators are responsible for choosing recipients, access roles, and the
          layers or features included in a shared map. Recipients must not redistribute restricted
          content or attempt to bypass the assigned role. Editor working copies remain separate
          projects unless an administrator deliberately incorporates their changes.
        </p>
      </PublicSection>
      <PublicSection title="Public and third-party data">
        <p>
          Basemaps, public records, geocoding results and connected services come from independent
          publishers. Their availability, licensing, accuracy and update schedules are outside
          LandDraft&apos;s control. Review source metadata and applicable terms before relying on or
          redistributing third-party data.
        </p>
      </PublicSection>
      <PublicSection title="Planning and reference only">
        <p>
          LandDraft measurements, parcel depictions, boundaries, labels and analysis outputs are for
          planning and reference. They are not a legal survey, title opinion, engineering decision,
          regulatory determination, emergency-navigation system or substitute for records and advice
          from a qualified professional or responsible authority.
        </p>
      </PublicSection>
      <PublicSection title="Availability and changes">
        <p>
          Features, data connections and limits may change as the service evolves. LandDraft may
          suspend access needed to protect users, comply with law, prevent abuse or maintain the
          service. You should keep independent exports or backups of information that is critical to
          your work.
        </p>
      </PublicSection>
      <PublicSection title="Disclaimers and responsibility">
        <p>
          The service is provided on an “as available” basis to the extent allowed by law. LandDraft
          does not guarantee that every dataset, calculation, connection or export is complete,
          current or error-free. To the extent allowed by law, LandDraft is not responsible for
          indirect or consequential losses arising from reliance on maps, public records or
          third-party services.
        </p>
      </PublicSection>
      <PublicSection title="Ending use and updates to these terms">
        <p>
          You may stop using LandDraft at any time. Access may be restricted for a material
          violation of these terms, subject to applicable law. Updated terms will be posted here
          with a revised date; continued use after an update means the revised terms apply.
        </p>
      </PublicSection>
      <PublicSection title="Contact">
        <p>
          Questions about these terms may be sent to the LandDraft user-support email displayed by
          the sign-in provider.
        </p>
      </PublicSection>
    </PublicPage>
  );
}
