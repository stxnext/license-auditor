import type {
  LicenseStatus,
  LicenseWithSource,
  VerificationStatus,
} from "../licenses/types.js";

export type DependencyEcosystem = "node" | "python";
export type DependencySource =
  | "node_modules"
  | "python-environment"
  | "uv-lock"
  | "requirements";
export type DependencyMetadataSource =
  | "local-metadata"
  | "pypi-json-api"
  | "license-file";

export interface DependenciesResult {
  dependencies: string[];
  warning?: string;
}

export interface DetectedLicense {
  packageName: string;
  packagePath: string;
  licenses: LicenseWithSource[];
  status: LicenseStatus;
  licensePath: string[];
  licenseExpression: string | undefined;
  verificationStatus: VerificationStatus | undefined;
  ecosystem?: DependencyEcosystem | undefined;
  dependencySource?: DependencySource | undefined;
  metadataSource?: DependencyMetadataSource | undefined;
}

export interface LicenseAuditResult {
  groupedByStatus: Record<LicenseStatus, DetectedLicense[]>;
  notFound: Map<
    string,
    {
      packageName?: string;
      packagePath: string;
      errorMessage: string;
      ecosystem?: DependencyEcosystem | undefined;
    }
  >;
  warning?: string | undefined;
  overrides: {
    notFoundOverrides: string[];
  };
  needsUserVerification: Map<
    string,
    {
      packageName?: string;
      packagePath: string;
      verificationMessage: string;
      ecosystem?: DependencyEcosystem | undefined;
    }
  >;
  errorResults: Map<
    string,
    {
      packageName?: string;
      packagePath: string;
      errorMessage: string;
      ecosystem?: DependencyEcosystem | undefined;
    }
  >;
}

export type JsonResults = LicenseAuditResult["groupedByStatus"] & {
  notFound: {
    ecosystem?: DependencyEcosystem | undefined;
    packagePath: string;
    errorMessage: string;
    packageName: string;
  }[];
  needsUserVerification: {
    ecosystem?: DependencyEcosystem | undefined;
    packageName: string;
    packagePath: string;
    verificationMessage: string;
  }[];
  errorResults: {
    ecosystem?: DependencyEcosystem | undefined;
    packageName: string;
    packagePath: string;
    errorMessage: string;
  }[];
};
