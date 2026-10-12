import { useTranslations } from "next-intl";
import { githubBlobUrl } from "../../helpers";
import { s } from "./styles";

interface OpenLinkProps {
  path: string;
  fullName: string | undefined;
  sha: string | undefined;
}

/** "Open" link to the file on GitHub at the stored commit, in a new tab (AC-29). Renders nothing without a URL. */
export function OpenLink({ path, fullName, sha }: OpenLinkProps) {
  const t = useTranslations("onboarding");
  const href = githubBlobUrl(fullName, sha, path);
  if (!href) return null;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      style={s.link}
      aria-label={`${t("paths.openAria", { path })} ${t("paths.opensNewTab")}`}
    >
      {t("paths.open")}
    </a>
  );
}
