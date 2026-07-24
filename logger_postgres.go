package main

import (
	"database/sql"
	"log"

	_ "github.com/lib/pq"
)

type PostgresJSONLogger struct {
	db        *sql.DB
	tableName string
}

func (l *PostgresJSONLogger) Put(jString string) error {
	query_s := "INSERT INTO " + l.tableName + " VALUES ('" + jString + "');"
	_, err := l.db.Exec(query_s)
	return err
}

func (l *PostgresJSONLogger) Close() error {
	if l.db == nil {
		return nil
	}
	return l.db.Close()
}

func NewPostgresJSONLogger(options map[string]any) EndpointLogger {
	tableName := "logs"
	dsn := ""
	if options == nil {
		panic("options must be set")
	}
	if v, ok := options["dsn"]; ok {
		dsn = v.(string)
	} else {
		panic("dsn must be set")
	}
	if v, ok := options["table-name"]; ok {
		tableName = v.(string)
	}

	db, err := sql.Open("postgres", dsn)
	if err != nil {
		log.Fatal(err)
	}
	return &PostgresJSONLogger{
		db:        db,
		tableName: tableName,
	}
}

func init() {
	RegisterEndpointLoggerFabric("postgres", EndpointLoggerFabricFunc(NewPostgresJSONLogger))
}
