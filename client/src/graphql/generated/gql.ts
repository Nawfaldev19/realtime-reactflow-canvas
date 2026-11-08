/* eslint-disable */
import * as types from './graphql';
import type { TypedDocumentNode as DocumentNode } from '@graphql-typed-document-node/core';

/**
 * Map of all GraphQL operations in the project.
 *
 * This map has several performance disadvantages:
 * 1. It is not tree-shakeable, so it will include all operations in the project.
 * 2. It is not minifiable, so the string of a GraphQL query will be multiple times inside the bundle.
 * 3. It does not support dead code elimination, so it will add unused operations.
 *
 * Therefore it is highly recommended to use the babel or swc plugin for production.
 * Learn more about it here: https://the-guild.dev/graphql/codegen/plugins/presets/preset-client#reducing-bundle-size
 */
type Documents = {
    "\n  query DemoMembers {\n    demoMembers {\n      id\n      name\n      initials\n      summary\n    }\n  }\n": typeof types.DemoMembersDocument,
    "\n  mutation SignInAsDemo($memberId: ID!) {\n    signInAsDemo(memberId: $memberId) {\n      token\n      viewer {\n        id\n        name\n      }\n      errors {\n        field\n        message\n      }\n    }\n  }\n": typeof types.SignInAsDemoDocument,
    "\n  query Viewer {\n    viewer {\n      id\n      name\n      email\n      initials\n      navigationMode\n    }\n    workspaces {\n      id\n      name\n      slug\n      role\n      canEdit\n      navigationMode\n    }\n  }\n": typeof types.ViewerDocument,
    "\n  query Diagrams($workspaceId: ID!) {\n    diagrams(workspaceId: $workspaceId) {\n      id\n      title\n      nodeCount\n      edgeCount\n      updatedAt\n      canEdit\n      updatedBy {\n        id\n        name\n      }\n    }\n  }\n": typeof types.DiagramsDocument,
    "\n  query Diagram($id: ID!) {\n    diagram(id: $id) {\n      id\n      title\n      revision\n      document\n      viewSettings\n      canEdit\n      collaborationEnabled\n      updatedAt\n      updatedBy {\n        id\n        name\n      }\n      workspace {\n        id\n        name\n        navigationMode\n        role\n      }\n    }\n  }\n": typeof types.DiagramDocument,
    "\n  mutation CreateDiagram($workspaceId: ID!, $title: String!) {\n    createDiagram(workspaceId: $workspaceId, title: $title) {\n      diagram {\n        id\n      }\n      errors {\n        field\n        message\n      }\n    }\n  }\n": typeof types.CreateDiagramDocument,
    "\n  mutation SaveDiagram($id: ID!, $baseRevision: Int!, $document: JSON!) {\n    saveDiagram(id: $id, baseRevision: $baseRevision, document: $document) {\n      diagram {\n        id\n        revision\n        updatedAt\n      }\n      errors {\n        field\n        message\n        code\n      }\n    }\n  }\n": typeof types.SaveDiagramDocument,
    "\n  mutation RenameDiagram($id: ID!, $title: String!) {\n    renameDiagram(id: $id, title: $title) {\n      diagram {\n        id\n        title\n      }\n      errors {\n        field\n        message\n      }\n    }\n  }\n": typeof types.RenameDiagramDocument,
    "\n  mutation DeleteDiagram($id: ID!) {\n    deleteDiagram(id: $id) {\n      deletedId\n      errors {\n        message\n      }\n    }\n  }\n": typeof types.DeleteDiagramDocument,
    "\n  mutation UpdateViewSettings($id: ID!, $viewSettings: JSON!) {\n    updateViewSettings(id: $id, viewSettings: $viewSettings) {\n      diagram {\n        id\n        viewSettings\n      }\n      errors {\n        field\n        message\n      }\n    }\n  }\n": typeof types.UpdateViewSettingsDocument,
    "\n  mutation SetCollaboration($id: ID!, $enabled: Boolean!) {\n    setCollaboration(id: $id, enabled: $enabled) {\n      diagram {\n        id\n        collaborationEnabled\n      }\n      errors {\n        message\n      }\n    }\n  }\n": typeof types.SetCollaborationDocument,
    "\n  mutation SetNavigationMode($mode: NavigationModeEnum) {\n    setNavigationMode(mode: $mode) {\n      viewer {\n        id\n        navigationMode\n      }\n      errors {\n        message\n      }\n    }\n  }\n": typeof types.SetNavigationModeDocument,
    "\n  mutation SetWorkspaceNavigationMode($workspaceId: ID!, $mode: NavigationModeEnum!) {\n    setWorkspaceNavigationMode(workspaceId: $workspaceId, mode: $mode) {\n      workspace {\n        id\n        navigationMode\n      }\n      errors {\n        message\n      }\n    }\n  }\n": typeof types.SetWorkspaceNavigationModeDocument,
    "\n  query DiagramVersions($id: ID!, $first: Int, $after: String) {\n    diagram(id: $id) {\n      id\n      versions(first: $first, after: $after) {\n        totalCount\n        hasNextPage\n        endCursor\n        nodes {\n          id\n          number\n          label\n          kind\n          createdAt\n          author {\n            id\n            name\n          }\n        }\n      }\n    }\n  }\n": typeof types.DiagramVersionsDocument,
    "\n  query VersionDocuments($ids: [ID!]!) {\n    versions(ids: $ids) {\n      id\n      number\n      document\n    }\n  }\n": typeof types.VersionDocumentsDocument,
    "\n  mutation SaveVersion($diagramId: ID!, $label: String, $automatic: Boolean) {\n    saveVersion(diagramId: $diagramId, label: $label, automatic: $automatic) {\n      created\n      version {\n        id\n        number\n      }\n      errors {\n        field\n        message\n      }\n    }\n  }\n": typeof types.SaveVersionDocument,
    "\n  mutation RestoreVersion($versionId: ID!) {\n    restoreVersion(versionId: $versionId) {\n      version {\n        id\n        number\n        document\n      }\n      checkpoint {\n        id\n        number\n      }\n      errors {\n        message\n      }\n    }\n  }\n": typeof types.RestoreVersionDocument,
    "\n  mutation CopyVersion($versionId: ID!) {\n    copyVersion(versionId: $versionId) {\n      diagram {\n        id\n      }\n      copyLog\n      errors {\n        message\n      }\n    }\n  }\n": typeof types.CopyVersionDocument,
    "\n  query Probe {\n    viewer {\n      id\n    }\n  }\n": typeof types.ProbeDocument,
};
const documents: Documents = {
    "\n  query DemoMembers {\n    demoMembers {\n      id\n      name\n      initials\n      summary\n    }\n  }\n": types.DemoMembersDocument,
    "\n  mutation SignInAsDemo($memberId: ID!) {\n    signInAsDemo(memberId: $memberId) {\n      token\n      viewer {\n        id\n        name\n      }\n      errors {\n        field\n        message\n      }\n    }\n  }\n": types.SignInAsDemoDocument,
    "\n  query Viewer {\n    viewer {\n      id\n      name\n      email\n      initials\n      navigationMode\n    }\n    workspaces {\n      id\n      name\n      slug\n      role\n      canEdit\n      navigationMode\n    }\n  }\n": types.ViewerDocument,
    "\n  query Diagrams($workspaceId: ID!) {\n    diagrams(workspaceId: $workspaceId) {\n      id\n      title\n      nodeCount\n      edgeCount\n      updatedAt\n      canEdit\n      updatedBy {\n        id\n        name\n      }\n    }\n  }\n": types.DiagramsDocument,
    "\n  query Diagram($id: ID!) {\n    diagram(id: $id) {\n      id\n      title\n      revision\n      document\n      viewSettings\n      canEdit\n      collaborationEnabled\n      updatedAt\n      updatedBy {\n        id\n        name\n      }\n      workspace {\n        id\n        name\n        navigationMode\n        role\n      }\n    }\n  }\n": types.DiagramDocument,
    "\n  mutation CreateDiagram($workspaceId: ID!, $title: String!) {\n    createDiagram(workspaceId: $workspaceId, title: $title) {\n      diagram {\n        id\n      }\n      errors {\n        field\n        message\n      }\n    }\n  }\n": types.CreateDiagramDocument,
    "\n  mutation SaveDiagram($id: ID!, $baseRevision: Int!, $document: JSON!) {\n    saveDiagram(id: $id, baseRevision: $baseRevision, document: $document) {\n      diagram {\n        id\n        revision\n        updatedAt\n      }\n      errors {\n        field\n        message\n        code\n      }\n    }\n  }\n": types.SaveDiagramDocument,
    "\n  mutation RenameDiagram($id: ID!, $title: String!) {\n    renameDiagram(id: $id, title: $title) {\n      diagram {\n        id\n        title\n      }\n      errors {\n        field\n        message\n      }\n    }\n  }\n": types.RenameDiagramDocument,
    "\n  mutation DeleteDiagram($id: ID!) {\n    deleteDiagram(id: $id) {\n      deletedId\n      errors {\n        message\n      }\n    }\n  }\n": types.DeleteDiagramDocument,
    "\n  mutation UpdateViewSettings($id: ID!, $viewSettings: JSON!) {\n    updateViewSettings(id: $id, viewSettings: $viewSettings) {\n      diagram {\n        id\n        viewSettings\n      }\n      errors {\n        field\n        message\n      }\n    }\n  }\n": types.UpdateViewSettingsDocument,
    "\n  mutation SetCollaboration($id: ID!, $enabled: Boolean!) {\n    setCollaboration(id: $id, enabled: $enabled) {\n      diagram {\n        id\n        collaborationEnabled\n      }\n      errors {\n        message\n      }\n    }\n  }\n": types.SetCollaborationDocument,
    "\n  mutation SetNavigationMode($mode: NavigationModeEnum) {\n    setNavigationMode(mode: $mode) {\n      viewer {\n        id\n        navigationMode\n      }\n      errors {\n        message\n      }\n    }\n  }\n": types.SetNavigationModeDocument,
    "\n  mutation SetWorkspaceNavigationMode($workspaceId: ID!, $mode: NavigationModeEnum!) {\n    setWorkspaceNavigationMode(workspaceId: $workspaceId, mode: $mode) {\n      workspace {\n        id\n        navigationMode\n      }\n      errors {\n        message\n      }\n    }\n  }\n": types.SetWorkspaceNavigationModeDocument,
    "\n  query DiagramVersions($id: ID!, $first: Int, $after: String) {\n    diagram(id: $id) {\n      id\n      versions(first: $first, after: $after) {\n        totalCount\n        hasNextPage\n        endCursor\n        nodes {\n          id\n          number\n          label\n          kind\n          createdAt\n          author {\n            id\n            name\n          }\n        }\n      }\n    }\n  }\n": types.DiagramVersionsDocument,
    "\n  query VersionDocuments($ids: [ID!]!) {\n    versions(ids: $ids) {\n      id\n      number\n      document\n    }\n  }\n": types.VersionDocumentsDocument,
    "\n  mutation SaveVersion($diagramId: ID!, $label: String, $automatic: Boolean) {\n    saveVersion(diagramId: $diagramId, label: $label, automatic: $automatic) {\n      created\n      version {\n        id\n        number\n      }\n      errors {\n        field\n        message\n      }\n    }\n  }\n": types.SaveVersionDocument,
    "\n  mutation RestoreVersion($versionId: ID!) {\n    restoreVersion(versionId: $versionId) {\n      version {\n        id\n        number\n        document\n      }\n      checkpoint {\n        id\n        number\n      }\n      errors {\n        message\n      }\n    }\n  }\n": types.RestoreVersionDocument,
    "\n  mutation CopyVersion($versionId: ID!) {\n    copyVersion(versionId: $versionId) {\n      diagram {\n        id\n      }\n      copyLog\n      errors {\n        message\n      }\n    }\n  }\n": types.CopyVersionDocument,
    "\n  query Probe {\n    viewer {\n      id\n    }\n  }\n": types.ProbeDocument,
};

/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 *
 *
 * @example
 * ```ts
 * const query = graphql(`query GetUser($id: ID!) { user(id: $id) { name } }`);
 * ```
 *
 * The query argument is unknown!
 * Please regenerate the types.
 */
export function graphql(source: string): unknown;

/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query DemoMembers {\n    demoMembers {\n      id\n      name\n      initials\n      summary\n    }\n  }\n"): (typeof documents)["\n  query DemoMembers {\n    demoMembers {\n      id\n      name\n      initials\n      summary\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation SignInAsDemo($memberId: ID!) {\n    signInAsDemo(memberId: $memberId) {\n      token\n      viewer {\n        id\n        name\n      }\n      errors {\n        field\n        message\n      }\n    }\n  }\n"): (typeof documents)["\n  mutation SignInAsDemo($memberId: ID!) {\n    signInAsDemo(memberId: $memberId) {\n      token\n      viewer {\n        id\n        name\n      }\n      errors {\n        field\n        message\n      }\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query Viewer {\n    viewer {\n      id\n      name\n      email\n      initials\n      navigationMode\n    }\n    workspaces {\n      id\n      name\n      slug\n      role\n      canEdit\n      navigationMode\n    }\n  }\n"): (typeof documents)["\n  query Viewer {\n    viewer {\n      id\n      name\n      email\n      initials\n      navigationMode\n    }\n    workspaces {\n      id\n      name\n      slug\n      role\n      canEdit\n      navigationMode\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query Diagrams($workspaceId: ID!) {\n    diagrams(workspaceId: $workspaceId) {\n      id\n      title\n      nodeCount\n      edgeCount\n      updatedAt\n      canEdit\n      updatedBy {\n        id\n        name\n      }\n    }\n  }\n"): (typeof documents)["\n  query Diagrams($workspaceId: ID!) {\n    diagrams(workspaceId: $workspaceId) {\n      id\n      title\n      nodeCount\n      edgeCount\n      updatedAt\n      canEdit\n      updatedBy {\n        id\n        name\n      }\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query Diagram($id: ID!) {\n    diagram(id: $id) {\n      id\n      title\n      revision\n      document\n      viewSettings\n      canEdit\n      collaborationEnabled\n      updatedAt\n      updatedBy {\n        id\n        name\n      }\n      workspace {\n        id\n        name\n        navigationMode\n        role\n      }\n    }\n  }\n"): (typeof documents)["\n  query Diagram($id: ID!) {\n    diagram(id: $id) {\n      id\n      title\n      revision\n      document\n      viewSettings\n      canEdit\n      collaborationEnabled\n      updatedAt\n      updatedBy {\n        id\n        name\n      }\n      workspace {\n        id\n        name\n        navigationMode\n        role\n      }\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation CreateDiagram($workspaceId: ID!, $title: String!) {\n    createDiagram(workspaceId: $workspaceId, title: $title) {\n      diagram {\n        id\n      }\n      errors {\n        field\n        message\n      }\n    }\n  }\n"): (typeof documents)["\n  mutation CreateDiagram($workspaceId: ID!, $title: String!) {\n    createDiagram(workspaceId: $workspaceId, title: $title) {\n      diagram {\n        id\n      }\n      errors {\n        field\n        message\n      }\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation SaveDiagram($id: ID!, $baseRevision: Int!, $document: JSON!) {\n    saveDiagram(id: $id, baseRevision: $baseRevision, document: $document) {\n      diagram {\n        id\n        revision\n        updatedAt\n      }\n      errors {\n        field\n        message\n        code\n      }\n    }\n  }\n"): (typeof documents)["\n  mutation SaveDiagram($id: ID!, $baseRevision: Int!, $document: JSON!) {\n    saveDiagram(id: $id, baseRevision: $baseRevision, document: $document) {\n      diagram {\n        id\n        revision\n        updatedAt\n      }\n      errors {\n        field\n        message\n        code\n      }\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation RenameDiagram($id: ID!, $title: String!) {\n    renameDiagram(id: $id, title: $title) {\n      diagram {\n        id\n        title\n      }\n      errors {\n        field\n        message\n      }\n    }\n  }\n"): (typeof documents)["\n  mutation RenameDiagram($id: ID!, $title: String!) {\n    renameDiagram(id: $id, title: $title) {\n      diagram {\n        id\n        title\n      }\n      errors {\n        field\n        message\n      }\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation DeleteDiagram($id: ID!) {\n    deleteDiagram(id: $id) {\n      deletedId\n      errors {\n        message\n      }\n    }\n  }\n"): (typeof documents)["\n  mutation DeleteDiagram($id: ID!) {\n    deleteDiagram(id: $id) {\n      deletedId\n      errors {\n        message\n      }\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation UpdateViewSettings($id: ID!, $viewSettings: JSON!) {\n    updateViewSettings(id: $id, viewSettings: $viewSettings) {\n      diagram {\n        id\n        viewSettings\n      }\n      errors {\n        field\n        message\n      }\n    }\n  }\n"): (typeof documents)["\n  mutation UpdateViewSettings($id: ID!, $viewSettings: JSON!) {\n    updateViewSettings(id: $id, viewSettings: $viewSettings) {\n      diagram {\n        id\n        viewSettings\n      }\n      errors {\n        field\n        message\n      }\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation SetCollaboration($id: ID!, $enabled: Boolean!) {\n    setCollaboration(id: $id, enabled: $enabled) {\n      diagram {\n        id\n        collaborationEnabled\n      }\n      errors {\n        message\n      }\n    }\n  }\n"): (typeof documents)["\n  mutation SetCollaboration($id: ID!, $enabled: Boolean!) {\n    setCollaboration(id: $id, enabled: $enabled) {\n      diagram {\n        id\n        collaborationEnabled\n      }\n      errors {\n        message\n      }\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation SetNavigationMode($mode: NavigationModeEnum) {\n    setNavigationMode(mode: $mode) {\n      viewer {\n        id\n        navigationMode\n      }\n      errors {\n        message\n      }\n    }\n  }\n"): (typeof documents)["\n  mutation SetNavigationMode($mode: NavigationModeEnum) {\n    setNavigationMode(mode: $mode) {\n      viewer {\n        id\n        navigationMode\n      }\n      errors {\n        message\n      }\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation SetWorkspaceNavigationMode($workspaceId: ID!, $mode: NavigationModeEnum!) {\n    setWorkspaceNavigationMode(workspaceId: $workspaceId, mode: $mode) {\n      workspace {\n        id\n        navigationMode\n      }\n      errors {\n        message\n      }\n    }\n  }\n"): (typeof documents)["\n  mutation SetWorkspaceNavigationMode($workspaceId: ID!, $mode: NavigationModeEnum!) {\n    setWorkspaceNavigationMode(workspaceId: $workspaceId, mode: $mode) {\n      workspace {\n        id\n        navigationMode\n      }\n      errors {\n        message\n      }\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query DiagramVersions($id: ID!, $first: Int, $after: String) {\n    diagram(id: $id) {\n      id\n      versions(first: $first, after: $after) {\n        totalCount\n        hasNextPage\n        endCursor\n        nodes {\n          id\n          number\n          label\n          kind\n          createdAt\n          author {\n            id\n            name\n          }\n        }\n      }\n    }\n  }\n"): (typeof documents)["\n  query DiagramVersions($id: ID!, $first: Int, $after: String) {\n    diagram(id: $id) {\n      id\n      versions(first: $first, after: $after) {\n        totalCount\n        hasNextPage\n        endCursor\n        nodes {\n          id\n          number\n          label\n          kind\n          createdAt\n          author {\n            id\n            name\n          }\n        }\n      }\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query VersionDocuments($ids: [ID!]!) {\n    versions(ids: $ids) {\n      id\n      number\n      document\n    }\n  }\n"): (typeof documents)["\n  query VersionDocuments($ids: [ID!]!) {\n    versions(ids: $ids) {\n      id\n      number\n      document\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation SaveVersion($diagramId: ID!, $label: String, $automatic: Boolean) {\n    saveVersion(diagramId: $diagramId, label: $label, automatic: $automatic) {\n      created\n      version {\n        id\n        number\n      }\n      errors {\n        field\n        message\n      }\n    }\n  }\n"): (typeof documents)["\n  mutation SaveVersion($diagramId: ID!, $label: String, $automatic: Boolean) {\n    saveVersion(diagramId: $diagramId, label: $label, automatic: $automatic) {\n      created\n      version {\n        id\n        number\n      }\n      errors {\n        field\n        message\n      }\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation RestoreVersion($versionId: ID!) {\n    restoreVersion(versionId: $versionId) {\n      version {\n        id\n        number\n        document\n      }\n      checkpoint {\n        id\n        number\n      }\n      errors {\n        message\n      }\n    }\n  }\n"): (typeof documents)["\n  mutation RestoreVersion($versionId: ID!) {\n    restoreVersion(versionId: $versionId) {\n      version {\n        id\n        number\n        document\n      }\n      checkpoint {\n        id\n        number\n      }\n      errors {\n        message\n      }\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation CopyVersion($versionId: ID!) {\n    copyVersion(versionId: $versionId) {\n      diagram {\n        id\n      }\n      copyLog\n      errors {\n        message\n      }\n    }\n  }\n"): (typeof documents)["\n  mutation CopyVersion($versionId: ID!) {\n    copyVersion(versionId: $versionId) {\n      diagram {\n        id\n      }\n      copyLog\n      errors {\n        message\n      }\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query Probe {\n    viewer {\n      id\n    }\n  }\n"): (typeof documents)["\n  query Probe {\n    viewer {\n      id\n    }\n  }\n"];

export function graphql(source: string) {
  return (documents as any)[source] ?? {};
}

export type DocumentType<TDocumentNode extends DocumentNode<any, any>> = TDocumentNode extends DocumentNode<  infer TType,  any>  ? TType  : never;