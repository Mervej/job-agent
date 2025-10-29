export class Emitter {
    eventMap;
    constructor() {
        this.eventMap = {}
    }   
    
    subscribber(event_id, fn) {
        if(!this.eventMap[event_id]) {
            this.eventMap[event_id] = [fn];
        } else {
            this.eventMap[event_id].push(fn);
        }
    }

    emit(event_id) {
        for(let event in this.eventMap) {
            
        }
    }
}

