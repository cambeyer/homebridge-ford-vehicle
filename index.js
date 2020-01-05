const util = require('util')
const axios = require('axios')
const qs = require('qs')

const ApplicationId = '71A3AD0A-CF46-4CCF-B473-FC7FE5BC4592'
const BaseVehicleApiUrl = 'https://usapi.cv.ford.com/api/vehicles'
const UpdateFrequencySecs = 60

let Service, Characteristic

module.exports = (homebridge) => {
  Service = homebridge.hap.Service
  Characteristic = homebridge.hap.Characteristic
  homebridge.registerAccessory('homebridge-ford-vehicle', 'FordVehicle', VehicleAccessory)
}

class VehicleAccessory {
  constructor (log, config) {
    this.log = log
    this.config = config
    this.service = new Service.Switch(this.config.name)
  }

  getServices() {
    const informationService = new Service.AccessoryInformation()
        .setCharacteristic(Characteristic.Manufacturer, 'Ford')
		.setCharacteristic(Characteristic.Model, 'Vehicle')
        .setCharacteristic(Characteristic.SerialNumber, this.config.vin)
	
	const getCallback = util.callbackify(this.getRemoteStartStatus.bind(this))
	const setCallback = util.callbackify(this.setRemoteStartStatusHandler.bind(this))

    this.onCharacteristic = this.service.getCharacteristic(Characteristic.On)
      .on('get', (callback) => getCallback(callback))
      .on('set', (value, callback) => setCallback(value, callback))
	
    return [informationService, this.service]
  }
  
  setOrResetTimeout() {
	if (this.timeout)
	{
		clearTimeout(this.timeout)
	}
	this.timeout = setTimeout(() => {
		this.onCharacteristic.getValue()
	}, UpdateFrequencySecs * 1000)
  }
  
  async getAuthorizationToken() {
	return (await axios({
		method: 'PUT',
		url: 'https://services.cx.ford.com/api/oauth2/v1/token',
		headers: {
			'application-id': ApplicationId
		},
		data: {
			code: (await axios({
			  method: 'POST',
			  url: 'https://fcis.ice.ibmcloud.com/v1.0/endpoint/default/token',
			  data: qs.stringify({
				client_id: '9fb503e0-715b-47e8-adfd-ad4b7770f73b',
				grant_type: 'password',
				username: this.config.username,
				password: this.config.password
			  })
		  })).data.access_token
		}
	})).data.access_token
  }
  
  async getRemoteStartStatus() {
	  this.setOrResetTimeout()
	  return (await axios({
		  method: 'GET',
		  url: `${BaseVehicleApiUrl}/v4/${this.config.vin}/status`,
		  headers: {
			  'application-id': ApplicationId,
			  'auth-token': await this.getAuthorizationToken()
		  }
	  })).data.vehiclestatus.remoteStartStatus.value !== 0
  }
  
  async remoteControlEngine(start) {
	  await axios({
		  method: start ? 'PUT' : 'DELETE',
		  url: `${BaseVehicleApiUrl}/v2/${this.config.vin}/engine/start`,
		  headers: {
			  'application-id': ApplicationId,
			  'auth-token': await this.getAuthorizationToken()
		  }
	  })
  }

  async setRemoteStartStatusHandler(desiredState) {
	this.log(`Called setRemoteStartStatusHandler with intent to ${desiredState ? 'start' : 'stop' } remote start`)
	this.log('--> Checking current remote start status')
	if (desiredState != await this.getRemoteStartStatus())
	{
		await this.remoteControlEngine(desiredState)
		this.log(`--> Vehicle remote start ${desiredState ? 'started' : 'stopped' }`)
	} else {
		this.log('--> Vehicle already matches the desired state')
	}
  }
}
