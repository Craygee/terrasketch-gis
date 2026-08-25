import { createFileRoute } from "@tanstack/react-router";

import { PublicPage, PublicSection } from "@/components/brand/PublicPage";

const title = "About LandDraft";
const description =
  "LandDraft is a friendly browser GIS for drawing, measuring, styling, analyzing and sharing geographic data.";

export const Route = createFileRoute("/about")({
  head: () => ({
    meta: [
      { title: `${title} — Friendly Maps, Real GIS Power` },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
    ],
  }),
  component: About,
});

function About() {
  return (
    <PublicPage
      eyebrow="About LandDraft"
      title="GIS tools that stay out of your way"
      intro="LandDraft brings capable geographic data work into a clean browser workspace, so people can move from a question to a useful map without learning a wall of toolbars."
    >
      <PublicSection title="Make and understand maps">
        <p>
          Draw points, lines and polygons; measure distance and area; style and label features from
          their attributes; search and select records; and create working layers from the results.
          LandDraft supports common GIS imports including GeoJSON, KML, KMZ, zipped Shapefiles, GPX
          and coordinate CSV files.
        </p>
      </PublicSection>
      <PublicSection title="Bring useful data together">
        <p>
          Connect public map services, combine them with your own files, organize layers and
          sublayers, and use focused spatial-analysis tools without leaving the map. Public datasets
          retain their source context so you can confirm currency, accuracy and licensing with the
          publishing authority.
        </p>
      </PublicSection>
      <PublicSection title="Keep control of the result">
        <p>
          Signed-in projects can follow you across devices with autosave and restore history. Export
          map layouts and common GIS formats when the work needs to move elsewhere. LandDraft is a
          planning and reference tool—not a survey, title report or substitute for an official
          determination.
        </p>
      </PublicSection>
      <div className="mt-10 flex flex-wrap gap-3">
        <a className="public-primary-link" href="/">
          Start mapping
        </a>
        <a className="public-secondary-link" href="/privacy">
          Read the privacy policy
        </a>
      </div>
    </PublicPage>
  );
}
