declare module "@vercel/blob" {
  export type PutCommandOptions = {
    access: "public";
    addRandomSuffix?: boolean;
    contentType?: string;
  };

  export type PutBlobResult = {
    url: string;
    pathname?: string;
  };

  export function put(
    pathname: string,
    body: BodyInit | Blob | File,
    options: PutCommandOptions,
  ): Promise<PutBlobResult>;
}
