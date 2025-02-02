import { resolve } from '@/ui/playground/resolve';
import { type ReferenceSchema, type RequestSchema } from '@/render/playground';
import { type DynamicField } from '@/ui/contexts/schema';

export interface FetchOptions {
  url: string;
  method: string;
  type: 'form-data' | 'json';

  header: Record<string, unknown>;

  body?: unknown;
  dynamicFields?: Map<string, DynamicField>;
}

export interface FetchResult {
  status: number;
  type: 'json' | 'html' | 'text';
  data: unknown;
}

export interface Fetcher {
  /**
   * @param input - fetch request inputs
   * @param dynamicFields - schema of dynamic fields, given by the playground client
   */
  fetch: (input: FetchOptions & {}) => Promise<FetchResult>;
}

/**
 * @param bodySchema - schema of body
 * @param references - defined references of schemas, needed for resolve cyclic references
 */
export function createBrowserFetcher(
  bodySchema: RequestSchema | undefined,
  references: Record<string, RequestSchema>,
): Fetcher {
  return {
    async fetch(input) {
      const headers = new Headers();
      if (input.type !== 'form-data')
        headers.append('Content-Type', 'application/json');

      for (const key of Object.keys(input.header)) {
        const paramValue = input.header[key];

        if (typeof paramValue === 'string' && paramValue.length > 0)
          headers.append(key, paramValue.toString());
      }

      return fetch(input.url, {
        method: input.method,
        headers,
        body: bodySchema
          ? createBodyFromValue(
              input.type,
              input.body,
              bodySchema,
              references,
              input.dynamicFields ?? new Map(),
            )
          : undefined,
        signal: AbortSignal.timeout(6000),
      })
        .then(async (res) => {
          const contentType = res.headers.get('Content-Type') ?? '';
          let type: FetchResult['type'];
          let data: unknown;

          if (contentType.startsWith('application/json')) {
            type = 'json';
            data = await res.json();
          } else {
            type = contentType.startsWith('text/html') ? 'html' : 'text';
            data = await res.text();
          }

          return { status: res.status, type, data };
        })
        .catch((e) => {
          const message =
            e instanceof Error ? `[${e.name}] ${e.message}` : e.toString();

          return {
            status: 400,
            type: 'text',
            data: `Client side error: ${message}`,
          };
        });
    },
  };
}

/**
 * Create request body from value
 */
export function createBodyFromValue(
  type: 'json' | 'form-data',
  value: unknown,
  schema: RequestSchema,
  references: Record<string, RequestSchema>,
  dynamicFields: Map<string, DynamicField>,
): string | FormData {
  const result = convertValue('body', value, schema, references, dynamicFields);

  if (type === 'json') {
    return JSON.stringify(result);
  }

  const formData = new FormData();

  if (typeof result !== 'object' || !result) {
    throw new Error(
      `Unsupported body type: ${typeof result}, expected: object`,
    );
  }

  for (const key of Object.keys(result)) {
    const prop: unknown = result[key as keyof object];

    if (typeof prop === 'object' && prop instanceof File) {
      formData.set(key, prop);
    }

    if (Array.isArray(prop) && prop.every((item) => item instanceof File)) {
      for (const item of prop) {
        formData.append(key, item);
      }
    }

    if (prop && !(prop instanceof File)) {
      formData.set(key, JSON.stringify(prop));
    }
  }

  return formData;
}

/**
 * Convert a value (object or string) to the corresponding type of schema
 *
 * @param fieldName - field name of value
 * @param value - the original value
 * @param schema - the schema of field
 * @param references - schema references
 * @param dynamicFields - Dynamic references
 */
function convertValue(
  fieldName: string,
  value: unknown,
  schema: RequestSchema,
  references: Record<string, RequestSchema>,
  dynamicFields: Map<string, DynamicField>,
): unknown {
  const isEmpty = value === '' || value === undefined || value === null;
  if (isEmpty && schema.isRequired)
    return schema.type === 'boolean' ? false : '';
  else if (isEmpty) return undefined;

  if (Array.isArray(value) && schema.type === 'array') {
    return value.map((item: unknown, index) =>
      convertValue(
        `${fieldName}.${String(index)}`,
        item,
        resolve(schema.items, references),
        references,
        dynamicFields,
      ),
    );
  }

  if (schema.type === 'switcher') {
    const schema = resolve(
      getDynamicFieldSchema(fieldName, dynamicFields),
      references,
    );

    return convertValue(fieldName, value, schema, references, dynamicFields);
  }

  if (typeof value === 'object' && schema.type === 'object') {
    const entries = Object.keys(value).map((key) => {
      const prop = value[key as keyof object];
      const propFieldName = `${fieldName}.${key}`;

      if (key in schema.properties) {
        return [
          key,
          convertValue(
            propFieldName,
            prop,
            resolve(schema.properties[key], references),
            references,
            dynamicFields,
          ),
        ];
      }

      if (schema.additionalProperties) {
        const schema = resolve(
          getDynamicFieldSchema(propFieldName, dynamicFields),
          references,
        );

        return [
          key,
          convertValue(propFieldName, prop, schema, references, dynamicFields),
        ];
      }

      console.warn('Could not resolve field', propFieldName, dynamicFields);
      return [key, prop];
    });

    return Object.fromEntries(entries);
  }

  switch (schema.type) {
    case 'number':
      return Number(value);
    case 'boolean':
      return value === 'null' ? undefined : value === 'true';
    case 'file':
      return value; // file
    default:
      return String(value);
  }
}

function getDynamicFieldSchema(
  name: string,
  dynamicFields: Map<string, DynamicField>,
): RequestSchema | ReferenceSchema {
  const field = dynamicFields.get(name);

  return field?.type === 'field'
    ? field.schema
    : { type: 'null', isRequired: false };
}
