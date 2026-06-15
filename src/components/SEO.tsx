import { Helmet } from "react-helmet-async";
import { useLocation } from "react-router-dom";

const SITE = "CareBridge Perth";
const ORIGIN = "https://carebridgeperth.lovable.app";

interface Props {
  title: string;
  description: string;
}

/** Per-route <title>, meta description, and self-referencing canonical. */
export function SEO({ title, description }: Props) {
  const { pathname } = useLocation();
  const fullTitle = title.includes(SITE) ? title : `${title} | ${SITE}`;
  const trimmedTitle = fullTitle.length > 60 ? fullTitle.slice(0, 57) + "…" : fullTitle;
  const url = `${ORIGIN}${pathname}`;
  return (
    <Helmet>
      <title>{trimmedTitle}</title>
      <meta name="description" content={description} />
      <link rel="canonical" href={url} />
      <meta property="og:title" content={trimmedTitle} />
      <meta property="og:description" content={description} />
      <meta property="og:url" content={url} />
      <meta name="twitter:title" content={trimmedTitle} />
      <meta name="twitter:description" content={description} />
    </Helmet>
  );
}
