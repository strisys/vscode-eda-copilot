import * as vscode from 'vscode';

let lastProfile: any = null;

export const getLastProfile = (): any => {
  return { ...lastProfile };
};

const mapConfig = (connectionProfile: any): any => {
  return {
    server: connectionProfile.server,
    database: connectionProfile.database,
    user: connectionProfile.email,
    password: connectionProfile.password,
    options: {
      encrypt: true,
    },
    authentication: {
      type: 'azure-active-directory-access-token',
      options: {
        token: connectionProfile.azureAccountToken,
      },
    },
  };
};

export const getConnectionInfo = async (): Promise<any> => {
  try {
    const mssqlExtension = vscode.extensions.getExtension('ms-mssql.mssql');

    if (!mssqlExtension) {
      throw new Error('MS SQL extension is not installed or not active.');
    }

    if (!mssqlExtension.isActive) {
      await mssqlExtension.activate();
    }

    const mssqlApi = mssqlExtension.exports;
    const connectionProfile = await mssqlApi.promptForConnection(false);

    if (!mssqlApi) {
      throw new Error('Failed to connect to the database.');
    }

    const connection = await mssqlApi.connect(connectionProfile);

    if (!connection) {
      throw new Error('No active MS SQL connection.');
    }

    return (lastProfile = mapConfig(connectionProfile));
  }
  catch (error) {
    throw new Error(`Error getting connection: ${error}`);
  }
};