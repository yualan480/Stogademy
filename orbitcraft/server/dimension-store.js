// Existing Overworld tables and metadata remain untouched. Player identities/inventories stay global.
export function dimensionSQL(sql,dimension){if(dimension!=='nether')return sql;return sql.replace(/\bblocks\b/g,'nether_blocks').replace(/\bdrops\b/g,'nether_drops').replace(/'survival'/g,"'nether-survival'");}
