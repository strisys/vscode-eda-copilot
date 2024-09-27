import * as vscode from 'vscode';
import { createUserMessage, ask } from '../ai/llm';
import { getConnectionInfo } from './sql-connection-util';
import { getSchema } from '../data-access/query-service';

const sqlRegex = /```([^\n])*\n([\s\S]*?)\n?```/g;

export type SqlResult = {
  value: string,
  sql: string,
  error?: string
}

vscode.commands.registerCommand('vscode-mssql-chat.runQuery', (query: string) => {
  runQuery(query);
});

export const chatRequestHandler: vscode.ChatRequestHandler = async (request, context, response, token) => {
  if (!(await vscode.commands.getCommands(true)).includes('vscode-mssql-chat.runQuery')) {
    vscode.commands.registerCommand('vscode-mssql-chat.runQuery', (query: string) => {
      runQuery(query);
    });
  }

  const result = await getSql(request.prompt, (value) => {
    response.markdown(value);
  });

  console.log(JSON.stringify(result, null, 2));

  if (!result.sql) {
    vscode.window.showErrorMessage('No SQL query found in response.');
    return;
  }

  response.button({ command: 'vscode-mssql-chat.runQuery', title: 'Run Query', arguments: [result.sql] });
};


const getSql = async (userQuestion: string, chunkReceived?: (value: any) => void): Promise<SqlResult> => {
  const connectionInfo = await getConnectionInfo();

  if (!connectionInfo) {
    return { value: '', sql: '', error: 'No connection info' };
  }

  const schema = await getSchema(connectionInfo);

  const createMessages = async (userQuestion: string): Promise<Array<vscode.LanguageModelChatMessage>> => {
    return [
      createUserMessage('You must return your suggested SQL query in a markdown code block that begins with ```sql and ends with ```.'),
      createUserMessage(schema + '\n' + userQuestion)
    ];
  };

  const messages = (await createMessages(userQuestion));
  const result = await ask(messages, chunkReceived);

  // extract sql
  const match = sqlRegex.exec(result.value);
  const sql = (match ? match[2] : '');

  return { ...result, sql };
};

async function runQuery(query: string) {
  // sets up an event listener for when the active text editor in VS Code changes, which will resolve the promise when triggered.
  const activeText = new Promise((resolve) => {
    vscode.window.onDidChangeActiveTextEditor(resolve);
    return vscode.commands.executeCommand('mssql.newQuery');
  });

  const timeout = new Promise(resolve => setTimeout(resolve, 3000));

  await Promise.race([activeText, timeout]);

  // if there is an active text editor insert the sql at origin
  await vscode.window.activeTextEditor?.edit((editBuilder) => {
    editBuilder.insert(new vscode.Position(0, 0), query);
  });

  // invoke command of ms-mssql.mssql 
  await vscode.commands.executeCommand('mssql.runQuery');
}