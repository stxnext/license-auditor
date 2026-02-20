import { EventEmitter } from "node:events";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchPypiProjectMetadata } from "./pypi-client.js";

const { getMock } = vi.hoisted(() => ({
  getMock: vi.fn(),
}));

vi.mock("node:https", () => ({
  default: {
    get: getMock,
  },
}));

afterEach(() => {
  getMock.mockReset();
});

describe("fetchPypiProjectMetadata", () => {
  it("returns parsed metadata when PyPI responds with 200", async () => {
    getMock.mockImplementation((_: string, __: object, callback: (response: MockResponse) => void) => {
      const request = createMockRequest();
      queueMicrotask(() => {
        const response = createMockResponse(200);
        callback(response);
        response.emit(
          "data",
          JSON.stringify({
            info: {
              name: "requests",
              version: "2.31.0",
              license: "Apache-2.0",
              license_expression: "Apache-2.0",
              classifiers: ["License :: OSI Approved :: Apache Software License"],
            },
          }),
        );
        response.emit("end");
      });
      return request;
    });

    const metadata = await fetchPypiProjectMetadata({
      name: "requests",
      version: "2.31.0",
    });

    expect(metadata).toEqual({
      name: "requests",
      version: "2.31.0",
      license: "Apache-2.0",
      licenseExpression: "Apache-2.0",
      classifiers: ["License :: OSI Approved :: Apache Software License"],
    });
  });

  it("returns null when status code is not 200", async () => {
    getMock.mockImplementation((_: string, __: object, callback: (response: MockResponse) => void) => {
      const request = createMockRequest();
      queueMicrotask(() => {
        const response = createMockResponse(404);
        callback(response);
      });
      return request;
    });

    const metadata = await fetchPypiProjectMetadata({
      name: "unknown-project",
      version: "0.0.1",
    });

    expect(metadata).toBeNull();
  });

  it("returns null on malformed JSON response", async () => {
    getMock.mockImplementation((_: string, __: object, callback: (response: MockResponse) => void) => {
      const request = createMockRequest();
      queueMicrotask(() => {
        const response = createMockResponse(200);
        callback(response);
        response.emit("data", "{not valid json");
        response.emit("end");
      });
      return request;
    });

    const metadata = await fetchPypiProjectMetadata({
      name: "requests",
      version: "2.31.0",
    });

    expect(metadata).toBeNull();
  });

  it("returns null on request timeout", async () => {
    getMock.mockImplementation(() => {
      const request = createMockRequest();
      queueMicrotask(() => {
        request.emit("timeout");
      });
      return request;
    });

    const metadata = await fetchPypiProjectMetadata({
      name: "requests",
      version: "2.31.0",
      timeoutMs: 1,
    });

    expect(metadata).toBeNull();
  });
});

type MockRequest = EventEmitter & {
  destroy: () => void;
};

type MockResponse = EventEmitter & {
  statusCode?: number | undefined;
  resume: () => void;
  setEncoding: (encoding: string) => void;
};

function createMockRequest(): MockRequest {
  const request = new EventEmitter() as MockRequest;
  request.destroy = () => undefined;
  return request;
}

function createMockResponse(statusCode: number): MockResponse {
  const response = new EventEmitter() as MockResponse;
  response.statusCode = statusCode;
  response.resume = () => undefined;
  response.setEncoding = () => undefined;
  return response;
}
