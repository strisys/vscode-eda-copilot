import * as vscode from 'vscode';
import { chatRequestHandler } from './ui/query-controller';

export function activate(context: vscode.ExtensionContext) {
	console.log('"vscode-eda-copilot" is now active!');

	vscode.chat.createChatParticipant('vscode-eda', chatRequestHandler);
}

export function deactivate() { }
