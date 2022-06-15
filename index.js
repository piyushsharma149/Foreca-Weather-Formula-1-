const fs = require ('fs');
const http = require('http');
const https = require('https');
const querystring = require('querystring');
const { mainModule } = require('process');
const port = 3000;
const server = http.createServer();

server.on("request", connection_handler);
function connection_handler(req, res){
	console.log(`New Request for ${req.url} from ${req.socket.remoteAddress}`);

	if (req.url === "/"){
		const main = fs.createReadStream('html/main.html');
		res.writeHead(200, {"Content-Type" : "text/html"});		//if text/plain is used then it displays actual html code
		main.pipe(res);
	}


	else if (req.url.startsWith("/search")){
		const url = new URL (req.url, "https://localhost:3000");
		const location = url.searchParams.get("location");

		const token_cache_file = './auth/authentication-res.json';
		let cache_valid = false;		//assume cache doesnt exist therefore false
		if(fs.existsSync(token_cache_file)){		//if cache file exists check it against date
			cached_token_object = require(token_cache_file);
			if(new Date(cached_token_object.expiration) > Date.now()){		//if valid date is greater than current date then its valid
				cache_valid = true;		
			}
		}

		if(cache_valid){		//if it is valid, we can bypass all functions called by request_access_token and straight to create_search_request
			let access_token = cached_token_object.access_token;
			console.log("cache exists and is valid");
			create_search_request(access_token, location, res);
		}

		else{
			request_access_token(location, res);
		}

	}
	else {
		res.writeHead(404, {"Content-Type": "text/plain"});
		res.write("404 Not Found", () => res.end());
	}
	
}

function stream_to_message(stream, callback, ...args){
	 let body = "";
	 stream.on("data", chunk => body += chunk);
	 stream.on("end", () => callback(body, ...args));
}

function request_access_token(location, res){

	const{user, password} = require('./auth/credentials.json');
	const options = {
		method:"POST",
		headers:{
			"Content-Type":'application/json'
		}
	};


	const post_data = JSON.stringify({user, password}); 
	const token_endpoint = "https://fnw-us.foreca.com/authorize/token?expire_hours=2";
	const token_request_time = new Date();
	const token_request = https.request(token_endpoint, options);
	token_request.once("error", err => {throw err});
	
	token_request.once("response", (token_stream) => stream_to_message(token_stream, received_token, location,  token_request_time, res));
	token_request.end(post_data); //or we may use ( , ()=> token_endpoint.end())
	
}

function received_token(serialized_token_object, location, token_request_time, res){
	let token_object = JSON.parse(serialized_token_object);
	let access_token = token_object.access_token;
	create_access_token_cache(token_object, token_request_time);
	create_search_request(access_token, location, res);
}

function create_access_token_cache(token_object, token_request_time){
	token_object.expiration = new Date(token_request_time.getTime() + (token_object.expires_in * 1000));
	fs.writeFile('./auth/authentication-res.json', JSON.stringify(token_object), () => console.log("Access Token Cached"));

}


function create_search_request(access_token, location, res){ //from spotify methods
	const options = {
		method:"GET",		//if we had https.get below, then no need of this
		headers:{
			"Authorization": `Bearer ${access_token}`
		}
	};
	
	const search_endpoint = `https://fnw-us.foreca.com/api/v1/location/search/`+location;
	const search_request = https.request(search_endpoint, options); //same as https.get()
	search_request.once("error", err => {throw err});
	search_request.once("response", (search_result_stream) => stream_to_message(search_result_stream, received_search_result, access_token, res));
	search_request.end();
	
}

function received_search_result(serialized_search_object, access_token, res){
	try{
		let search_results = JSON.parse(serialized_search_object);
		
			const location_id = search_results.locations[0].id;
			const location_name = search_results.locations[0].name;
			const location_country = search_results.locations[0].country;
			const location_string = `${location_name}, ${location_country} has a temperature of: `;
		
		

		const options = {
			method:"GET",		//if we had https.get below, then no need of this
			headers:{
				"Authorization": `Bearer ${access_token}`
			}
		};
		
		const search_endpoint = `https://fnw-us.foreca.com/api/v1/current/`+location_id;
		const search_request = https.request(search_endpoint, options); //same as https.get()
		search_request.once("error", err => {throw err});
		search_request.once("response", (received_result_stream) => stream_to_message(received_result_stream, received_temp_result, location_string, res));
		search_request.end();
	}catch(error){
		res.writeHead(404, {"Content-Type": "text/plain"});
		res.write("404 Not Found", () => res.end());
	}
}


function received_temp_result(serialized_temp_object, location_string, res){
	const temp_results = JSON.parse(serialized_temp_object);
	const loc_temperature = temp_results.current.temperature;
	const output_string = `${location_string}${loc_temperature} degree Celsius`;
	request_f1_stream(output_string, res);
}

function request_f1_stream(output_string, res){

	const options = {
		method:"GET",
		headers:{
		}
	};

	const token_endpoint = "http://ergast.com/api/f1/current/next.json";
	const token_request = http.request(token_endpoint, options);
	token_request.once("error", err => {throw err});
	token_request.once("response",(received_f1_stream) => stream_to_message(received_f1_stream, generate_webpage, output_string, res));
	token_request.end(); 
	
}


function generate_webpage (serialized_f1_object, output_string, res){
	const f1_stream = JSON.parse(serialized_f1_object);
	const race_link = f1_stream.MRData.RaceTable.Races[0].url;
	const race_name = f1_stream.MRData.RaceTable.Races[0].raceName;
	const circuit_Name = f1_stream.MRData.RaceTable.Races[0].Circuit.circuitName;
	const season = f1_stream.MRData.RaceTable.Races[0].season;

	res.writeHead(200, {"Content-Type" : "text/html"});
	res.end(`<h2>${output_string}<h2><h3>${season}, ${race_name}, ${circuit_Name} <h3> <a href=${race_link}>Race Link</a>`);
	
}



server.on("listening", listening_handler);
server.listen(port);
function listening_handler(){
	console.log(`Now Listening on Port ${port}`);
}

