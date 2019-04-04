HOST=""
DATABASE=""
USER=""
PASSWORD=""
PORT=""

./node_modules/sequelize-auto/bin/sequelize-auto -h ${HOST} -d ${DATABASE} -u ${USER} -x ${PASSWORD} -p ${PORT} -c config.json -o src/models -e postgres -t Assertions,Documents