---
name: google-data-agent-vertex
description: Connect with Google Vertex AI Agents, Vertex AI Search & Conversation, BigQuery, and structured/unstructured datastores via MCP tools.
---

# Google Data Agent & Vertex AI Integration Skill

This skill explains how to connect agents to Google Cloud's data infrastructure, Vertex AI Search & Conversation (Discovery Engine), Vertex AI Agent Builder, and BigQuery data pipelines.

## 1. Capabilities

- **Unstructured Search**: Query documents, PDFs, curriculum guides, textbook chapters using Vertex AI Search Datastores.
- **Structured Analytics**: Query BigQuery datasets, student engagement metrics, quiz records.
- **Agent Builder Integration**: Delegate tasks to a pre-trained Vertex AI conversational agent session.

---

## 2. Vertex AI Search / Discovery Engine

### Dependencies
```bash
npm install @google-cloud/discoveryengine
```

### Searching Curriculum / Datastores
```typescript
import { SearchServiceClient } from '@google-cloud/discoveryengine';

const client = new SearchServiceClient();

export async function searchDataStore(params: {
  projectId: string;
  location: string; // e.g. "global"
  collectionId: string; // default is "default_collection"
  dataStoreId: string;
  query: string;
}) {
  const servingConfig = client.projectLocationCollectionDataStoreServingConfigPath(
    params.projectId,
    params.location,
    params.collectionId || 'default_collection',
    params.dataStoreId,
    'default_search'
  );

  const [response] = await client.search({
    servingConfig,
    query: params.query,
    pageSize: 5,
    queryExpansionSpec: { condition: 'AUTO' },
    spellCorrectionSpec: { mode: 'AUTO' },
    contentSearchSpec: {
      summarySpec: {
        summaryResultCount: 3,
        includeCitations: true,
      },
      snippetSpec: { returnSnippet: true },
    },
  });

  return {
    summary: response.summary?.summaryText,
    results: response.results?.map(r => ({
      id: r.id,
      title: (r.document?.derivedStructData as any)?.title,
      link: (r.document?.derivedStructData as any)?.link,
      snippets: (r.document?.derivedStructData as any)?.snippets,
    })),
  };
}
```

---

## 3. Vertex AI Agent Builder Session Execution

Interact with pre-configured Google Data Agents or conversational flow agents:

```typescript
import { ConversationalSearchServiceClient } from '@google-cloud/discoveryengine';

const conversationalClient = new ConversationalSearchServiceClient();

export async function converseWithDataAgent(
  projectId: string,
  dataStoreId: string,
  query: string,
  conversationName?: string
) {
  const servingConfig = conversationalClient.projectLocationCollectionDataStoreServingConfigPath(
    projectId,
    'global',
    'default_collection',
    dataStoreId,
    'default_search'
  );

  const [response] = await conversationalClient.converseConversation({
    name: conversationName,
    servingConfig,
    query: { input: query },
  });

  return {
    reply: response.reply?.reply,
    conversation: response.conversation?.name,
    searchResults: response.searchResults,
  };
}
```

---

## 4. BigQuery Data Agent Tool

For structured queries using standard SQL:

```typescript
import { BigQuery } from '@google-cloud/bigquery';

const bq = new BigQuery();

export async function runDatasetQuery(query: string) {
  const [rows] = await bq.query({ query, location: 'US' });
  return rows;
}
```
