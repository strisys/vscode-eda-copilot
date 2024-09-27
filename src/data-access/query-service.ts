import * as mssql from 'mssql';

interface TableInfo {
  table_schema: string;
  table_name: string;
  column_name: string;
  data_type: string;
  max_length: number | null;
  is_nullable: string;
  is_primary_key: string;
  fk_constraint_name: string | null;
  referenced_schema: string | null;
  referenced_table: string | null;
  referenced_column: string | null;
}

let scripts: Record<string, string> = {};

export interface MssqlConfig {
  server: string;
  database: string;
  user: string;
  password: string;
  options: {
    encrypt: boolean;
  };
  authentication: {
    type: 'azure-active-directory-access-token';
    options: {
      token: string;
    };
  };
}

const getConnection = async (connectionInfo: MssqlConfig): Promise<any> => {
  try {
    return mssql.connect(connectionInfo);
  }
  catch (error) {
    throw new Error(`Error getting connection: ${error}`);
  }
};

const runSql = async (connectionInfo: any, query: string): Promise<mssql.IRecordSet<any>> => {
  let pool: any;

  try {
    pool = await getConnection(connectionInfo);
    const result = await pool.request().query(query);
    return result.recordset;
  }
  catch (error) {
    console.log(`Error running query: ${error}`);
    throw error;
  }
  finally {
    if (pool) {
      await pool.close();
    }
  }
};

const getSchemaSql = (): string => {
  const query = `
SELECT
    t.TABLE_SCHEMA AS table_schema,
    t.TABLE_NAME AS table_name,
    c.COLUMN_NAME AS column_name,
    c.DATA_TYPE AS data_type,
    c.CHARACTER_MAXIMUM_LENGTH AS max_length,
    c.IS_NULLABLE AS is_nullable,
    CASE WHEN pk.COLUMN_NAME IS NOT NULL THEN 'YES' ELSE 'NO' END AS is_primary_key,
    fk.CONSTRAINT_NAME AS fk_constraint_name,
    fkc.TABLE_SCHEMA AS referenced_schema,
    fkc.TABLE_NAME AS referenced_table,
    fkc.COLUMN_NAME AS referenced_column
FROM
    INFORMATION_SCHEMA.TABLES t
    JOIN
    INFORMATION_SCHEMA.COLUMNS c ON t.TABLE_SCHEMA = c.TABLE_SCHEMA AND t.TABLE_NAME = c.TABLE_NAME
    LEFT JOIN
    INFORMATION_SCHEMA.KEY_COLUMN_USAGE pk ON
        t.TABLE_SCHEMA = pk.TABLE_SCHEMA AND
        t.TABLE_NAME = pk.TABLE_NAME AND
        c.COLUMN_NAME = pk.COLUMN_NAME AND
        pk.CONSTRAINT_NAME LIKE 'PK_%'
    LEFT JOIN
    INFORMATION_SCHEMA.KEY_COLUMN_USAGE fk ON
        t.TABLE_SCHEMA = fk.TABLE_SCHEMA AND
        t.TABLE_NAME = fk.TABLE_NAME AND
        c.COLUMN_NAME = fk.COLUMN_NAME AND
        fk.CONSTRAINT_NAME LIKE 'FK_%'
    LEFT JOIN
    INFORMATION_SCHEMA.REFERENTIAL_CONSTRAINTS rc ON
        fk.CONSTRAINT_NAME = rc.CONSTRAINT_NAME AND
        fk.TABLE_SCHEMA = rc.CONSTRAINT_SCHEMA
    LEFT JOIN
    INFORMATION_SCHEMA.KEY_COLUMN_USAGE fkc ON
        rc.UNIQUE_CONSTRAINT_NAME = fkc.CONSTRAINT_NAME AND
        rc.UNIQUE_CONSTRAINT_SCHEMA = fkc.CONSTRAINT_SCHEMA
WHERE
    t.TABLE_TYPE = 'BASE TABLE'
ORDER BY
    t.TABLE_SCHEMA,
    t.TABLE_NAME,
    c.ORDINAL_POSITION;
    `;

  return query;
};

const toDatabaseDefinitionSyntax = (recordset: mssql.IRecordSet<any>): string => {
  const tables: { [key: string]: TableInfo[] } = {};
  const foreignKeys: { [key: string]: TableInfo[] } = {};

  // Group rows by table
  recordset.forEach(row => {
    const tableKey = `${row.table_schema}.${row.table_name}`;
    if (!tables[tableKey]) {
      tables[tableKey] = [];
    }
    tables[tableKey].push(row);

    // Group foreign keys
    if (row.fk_constraint_name) {
      if (!foreignKeys[row.fk_constraint_name]) {
        foreignKeys[row.fk_constraint_name] = [];
      }
      foreignKeys[row.fk_constraint_name].push(row);
    }
  });

  let ddl = '';

  // Generate CREATE TABLE statements
  for (const [tableKey, columns] of Object.entries(tables)) {
    const [schema, tableName] = tableKey.split('.');
    ddl += `CREATE TABLE [${schema}].[${tableName}] (\n`;

    const columnDefinitions = columns.map(col => {
      let def = `  [${col.column_name}] ${col.data_type}`;
      if (col.max_length !== null && col.data_type.toLowerCase() !== 'text') {
        def += `(${col.max_length})`;
      }
      def += col.is_nullable === 'YES' ? ' NULL' : ' NOT NULL';
      return def;
    });

    ddl += columnDefinitions.join(',\n');

    // Add primary key constraint
    const pkColumns = columns.filter(col => col.is_primary_key === 'YES');
    if (pkColumns.length > 0) {
      const pkColumnNames = pkColumns.map(col => `[${col.column_name}]`).join(', ');
      ddl += `,\n  CONSTRAINT [PK_${tableName}] PRIMARY KEY (${pkColumnNames})`;
    }

    ddl += '\n);\n\n';
  }

  // Generate ALTER TABLE statements for foreign keys
  for (const [constraintName, fkColumns] of Object.entries(foreignKeys)) {
    const fk = fkColumns[0]; // All rows for this constraint will have the same table info
    ddl += `ALTER TABLE [${fk.table_schema}].[${fk.table_name}]\n`;
    ddl += `ADD CONSTRAINT [${constraintName}] FOREIGN KEY (`;
    ddl += fkColumns.map(col => `[${col.column_name}]`).join(', ');
    ddl += `)\nREFERENCES [${fk.referenced_schema}].[${fk.referenced_table}] (`;
    ddl += fkColumns.map(col => `[${col.referenced_column}]`).join(', ');
    ddl += ');\n\n';
  }

  return ddl;
};

export async function getDatabaseSchema(connectionInfo: any): Promise<string> {
  try {
    const result = await runSql(connectionInfo, getSchemaSql());
    const ddl = toDatabaseDefinitionSyntax(result);

    console.log(ddl);
    return ddl;
  }
  catch (error) {
    throw new Error(`Error getting database schema: ${error}`);
  }
}

export async function getSchema(connectionInfo: MssqlConfig): Promise<string> {
  const key = JSON.stringify(connectionInfo);
  scripts[key] ??= (await getDatabaseSchema(connectionInfo));
  return scripts[key];
}

