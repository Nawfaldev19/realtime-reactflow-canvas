import { graphql } from "./generated";

export const DEMO_MEMBERS = graphql(`
  query DemoMembers {
    demoMembers {
      id
      name
      initials
      summary
    }
  }
`);

export const SIGN_IN_AS_DEMO = graphql(`
  mutation SignInAsDemo($memberId: ID!) {
    signInAsDemo(memberId: $memberId) {
      token
      viewer {
        id
        name
      }
      errors {
        field
        message
      }
    }
  }
`);

export const VIEWER = graphql(`
  query Viewer {
    viewer {
      id
      name
      email
      initials
      navigationMode
    }
    workspaces {
      id
      name
      slug
      role
      canEdit
      navigationMode
    }
  }
`);

export const DIAGRAMS = graphql(`
  query Diagrams($workspaceId: ID!) {
    diagrams(workspaceId: $workspaceId) {
      id
      title
      nodeCount
      edgeCount
      updatedAt
      canEdit
      updatedBy {
        id
        name
      }
    }
  }
`);

export const DIAGRAM = graphql(`
  query Diagram($id: ID!) {
    diagram(id: $id) {
      id
      title
      revision
      document
      viewSettings
      canEdit
      collaborationEnabled
      updatedAt
      updatedBy {
        id
        name
      }
      workspace {
        id
        name
        navigationMode
        role
      }
    }
  }
`);

export const CREATE_DIAGRAM = graphql(`
  mutation CreateDiagram($workspaceId: ID!, $title: String!) {
    createDiagram(workspaceId: $workspaceId, title: $title) {
      diagram {
        id
      }
      errors {
        field
        message
      }
    }
  }
`);

export const SAVE_DIAGRAM = graphql(`
  mutation SaveDiagram($id: ID!, $baseRevision: Int!, $document: JSON!) {
    saveDiagram(id: $id, baseRevision: $baseRevision, document: $document) {
      diagram {
        id
        revision
        updatedAt
      }
      errors {
        field
        message
        code
      }
    }
  }
`);

export const RENAME_DIAGRAM = graphql(`
  mutation RenameDiagram($id: ID!, $title: String!) {
    renameDiagram(id: $id, title: $title) {
      diagram {
        id
        title
      }
      errors {
        field
        message
      }
    }
  }
`);

export const DELETE_DIAGRAM = graphql(`
  mutation DeleteDiagram($id: ID!) {
    deleteDiagram(id: $id) {
      deletedId
      errors {
        message
      }
    }
  }
`);

export const UPDATE_VIEW_SETTINGS = graphql(`
  mutation UpdateViewSettings($id: ID!, $viewSettings: JSON!) {
    updateViewSettings(id: $id, viewSettings: $viewSettings) {
      diagram {
        id
        viewSettings
      }
      errors {
        field
        message
      }
    }
  }
`);

export const SET_COLLABORATION = graphql(`
  mutation SetCollaboration($id: ID!, $enabled: Boolean!) {
    setCollaboration(id: $id, enabled: $enabled) {
      diagram {
        id
        collaborationEnabled
      }
      errors {
        message
      }
    }
  }
`);

export const SET_NAVIGATION_MODE = graphql(`
  mutation SetNavigationMode($mode: NavigationModeEnum) {
    setNavigationMode(mode: $mode) {
      viewer {
        id
        navigationMode
      }
      errors {
        message
      }
    }
  }
`);

export const SET_WORKSPACE_NAVIGATION_MODE = graphql(`
  mutation SetWorkspaceNavigationMode($workspaceId: ID!, $mode: NavigationModeEnum!) {
    setWorkspaceNavigationMode(workspaceId: $workspaceId, mode: $mode) {
      workspace {
        id
        navigationMode
      }
      errors {
        message
      }
    }
  }
`);

export const DIAGRAM_VERSIONS = graphql(`
  query DiagramVersions($id: ID!, $first: Int, $after: String) {
    diagram(id: $id) {
      id
      versions(first: $first, after: $after) {
        totalCount
        hasNextPage
        endCursor
        nodes {
          id
          number
          label
          kind
          createdAt
          author {
            id
            name
          }
        }
      }
    }
  }
`);

export const VERSION_DOCUMENTS = graphql(`
  query VersionDocuments($ids: [ID!]!) {
    versions(ids: $ids) {
      id
      number
      document
    }
  }
`);

export const SAVE_VERSION = graphql(`
  mutation SaveVersion($diagramId: ID!, $label: String, $automatic: Boolean) {
    saveVersion(diagramId: $diagramId, label: $label, automatic: $automatic) {
      created
      version {
        id
        number
      }
      errors {
        field
        message
      }
    }
  }
`);

export const RESTORE_VERSION = graphql(`
  mutation RestoreVersion($versionId: ID!) {
    restoreVersion(versionId: $versionId) {
      version {
        id
        number
        document
      }
      checkpoint {
        id
        number
      }
      errors {
        message
      }
    }
  }
`);

export const COPY_VERSION = graphql(`
  mutation CopyVersion($versionId: ID!) {
    copyVersion(versionId: $versionId) {
      diagram {
        id
      }
      copyLog
      errors {
        message
      }
    }
  }
`);
