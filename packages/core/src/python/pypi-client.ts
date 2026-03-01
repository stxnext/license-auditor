import https from "node:https";

export type PypiProjectMetadata = {
  name: string;
  version: string;
  license?: string | undefined;
  licenseExpression?: string | undefined;
  classifiers: string[];
};

export async function fetchPypiProjectMetadata({
  name,
  version,
  timeoutMs = 10000,
}: {
  name: string;
  version: string;
  timeoutMs?: number | undefined;
}): Promise<PypiProjectMetadata | null> {
  const endpoint = `https://pypi.org/pypi/${encodeURIComponent(name)}/${encodeURIComponent(version)}/json`;

  return await new Promise((resolve) => {
    const request = https.get(endpoint, { timeout: timeoutMs }, (response) => {
      if (response.statusCode !== 200) {
        response.resume();
        resolve(null);
        return;
      }

      const chunks: string[] = [];
      response.setEncoding("utf8");
      response.on("data", (chunk) => {
        chunks.push(chunk);
      });
      response.on("end", () => {
        resolve(parsePypiMetadataResponse(chunks));
      });
    });

    request.on("timeout", () => {
      request.destroy();
      resolve(null);
    });

    request.on("error", () => {
      resolve(null);
    });
  });
}

function parsePypiMetadataResponse(
  chunks: string[],
): PypiProjectMetadata | null {
  try {
    const parsed = JSON.parse(chunks.join("")) as {
      info?: Record<string, unknown>;
    };

    const info = parsed.info;
    if (!(info && typeof info === "object")) {
      return null;
    }

    const resolvedName =
      typeof info["name"] === "string" ? info["name"] : undefined;
    const resolvedVersion =
      typeof info["version"] === "string" ? info["version"] : undefined;

    if (!(resolvedName && resolvedVersion)) {
      return null;
    }

    const license =
      typeof info["license"] === "string" ? info["license"] : undefined;
    const licenseExpression =
      typeof info["license_expression"] === "string"
        ? info["license_expression"]
        : undefined;
    const classifiers = info["classifiers"];

    return {
      name: resolvedName,
      version: resolvedVersion,
      license,
      licenseExpression,
      classifiers: Array.isArray(classifiers)
        ? classifiers.filter(
            (classifier): classifier is string =>
              typeof classifier === "string",
          )
        : [],
    };
  } catch {
    return null;
  }
}
