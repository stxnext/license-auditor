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
        try {
          const parsed = JSON.parse(chunks.join("")) as {
            info?: {
              name?: string;
              version?: string;
              license?: string;
              license_expression?: string;
              classifiers?: string[];
            };
          };

          const info = parsed.info;
          if (!info?.name || !info.version) {
            resolve(null);
            return;
          }

          resolve({
            name: info.name,
            version: info.version,
            license: info.license,
            licenseExpression: info.license_expression,
            classifiers: Array.isArray(info.classifiers) ? info.classifiers : [],
          });
        } catch {
          resolve(null);
        }
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
